const { Order, DeliveryTask, User, DeliveryAgentProfile, PlatformConfig, Wallet, Transaction, DeliveryCharge } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../database/database');
const { matchAgentsToOrder, checkProfileCompleteness } = require('../utils/deliveryUtils');
const { notifyDeliveryAgentAssignment, createNotification } = require('../utils/notificationHelpers');
const { upsertDeliveryChargeForTask, invoiceSellerChargeImmediately } = require('../utils/deliveryChargeHelpers');
const { revertPending, creditPending } = require('../utils/walletHelpers');

/**
 * Smart Auto-Dispatch Service
 */
const autoDispatchService = {
    /**
     * Attempts to automatically assign a delivery agent to an order.
     * @param {number} orderId - The ID of the order to dispatch.
     * @param {object} options - Optional overrides (e.g. excludeAgentIds).
     * @returns {Promise<object|null>} The assigned task or null if no agent found.
     */
    runAutoDispatch: async (orderId, options = {}) => {
        const { excludeAgentIds = [] } = options;
        console.log(`🚀 [AutoDispatch] Starting dispatch for Order #${orderId}...`);

        const t = await sequelize.transaction();
        try {
            // 1. Fetch Order and Config
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessLat', 'businessLng'] },
                    { model: User, as: 'user', attributes: ['id', 'name', 'phone'] }
                ],
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                if (t) await t.rollback();
                return null;
            }

            const configRecord = await PlatformConfig.findOne({ where: { key: 'logistic_settings' }, transaction: t });
            const settings = configRecord ? (typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value) : {};

            if (!settings.autoDispatchOrders) {
                console.log(`⏸️ [AutoDispatch] Auto-dispatch is disabled in settings.`);
                if (t) await t.rollback();
                return null;
            }

            // 2. Find agents with delivery role
            const potentialAgents = await User.findAll({
                where: {
                    id: { [Op.notIn]: excludeAgentIds },
                    isDeactivated: false,
                    isFrozen: false
                },
                include: [{
                    model: DeliveryAgentProfile,
                    as: 'deliveryProfile',
                    where: { isActive: true },
                    required: true
                }],
                transaction: t
            });

            const onlineAgents = potentialAgents.filter(u => {
                const roles = Array.isArray(u.roles) ? u.roles : (typeof u.roles === 'string' ? JSON.parse(u.roles || '[]') : []);
                return u.role === 'delivery_agent' || roles.includes('delivery_agent');
            });

            console.log(`🔍 [AutoDispatch] Found ${onlineAgents.length} active delivery agents.`);

            // Log details about profile completeness for debugging
            const incompleteAgents = [];
            const completeAgents = onlineAgents.filter(agent => {
                const { isComplete, missing } = checkProfileCompleteness(agent.deliveryProfile, agent);
                if (!isComplete) {
                    incompleteAgents.push({ name: agent.name, missing });
                    return false;
                }
                return true;
            });

            if (incompleteAgents.length > 0) {
                console.log(`ℹ️ [AutoDispatch] Excluded ${incompleteAgents.length} agents with incomplete profiles:`, JSON.stringify(incompleteAgents));
            }

            if (onlineAgents.length === 0) {
                console.log(`⚠️ [AutoDispatch] No online agents available.`);
                if (t) await t.rollback();
                return null;
            }

            // 3. Filter agents who have already rejected or failed this order
            const previousAttempts = await DeliveryTask.findAll({
                where: {
                    orderId,
                    status: { [Op.in]: ['rejected', 'failed'] }
                },
                attributes: ['deliveryAgentId'],
                transaction: t
            });
            const attemptedAgentIds = previousAttempts.map(ta => ta.deliveryAgentId);
            
            // 4. Filter agents who are at capacity (Limit: 3 active tasks)
            const activeTasksCount = await DeliveryTask.findAll({
                where: {
                    status: { [Op.in]: ['assigned', 'accepted', 'arrived_at_pickup', 'in_progress'] },
                    deliveryAgentId: { [Op.in]: onlineAgents.map(a => a.id) }
                },
                attributes: ['deliveryAgentId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                group: ['deliveryAgentId'],
                transaction: t
            });
            
            const capacityMap = {};
            activeTasksCount.forEach(row => {
                capacityMap[row.deliveryAgentId] = parseInt(row.get('count'), 10);
            });

            const eligibleAgents = completeAgents.filter(agent => {
                if (attemptedAgentIds.includes(agent.id)) return false;
                if (capacityMap[agent.id] >= 3) return false; // Hard limit for auto-dispatch
                return true;
            });

            console.log(`🔍 [AutoDispatch] ${eligibleAgents.length} agents are eligible (complete profile, not at capacity, not previously rejected).`);

            if (eligibleAgents.length === 0) {
                console.log(`⚠️ [AutoDispatch] No eligible agents found (all rejected, at capacity, or incomplete profiles).`);
                if (t) await t.rollback();
                return null;
            }

            // 5. Smart Matching
            const matches = matchAgentsToOrder(eligibleAgents, order);
            if (matches.length === 0) {
                console.log(`⚠️ [AutoDispatch] Matching algorithm returned no suitable agents.`);
                if (t) await t.rollback();
                return null;
            }

            const bestMatch = matches[0].agent;
            console.log(`🎯 [AutoDispatch] Selected Agent: ${bestMatch.name} (Score: ${matches[0].score})`);

            // 6. Assignment Logic (Mirroring orderController.js)
            const { getProvisionalDeliveryType } = require('../controllers/deliveryController');
            const dType = getProvisionalDeliveryType(order);
            const finalFee = parseFloat(order.deliveryFee) || 0;
            
            let currentShare = 70;
            const shareConfig = await PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' }, transaction: t });
            if (shareConfig) currentShare = parseFloat(shareConfig.value);

            const agentEarnings = finalFee * (currentShare / 100);

            // Create or update task
            const existingTask = await DeliveryTask.findOne({
                where: { orderId: order.id, status: { [Op.notIn]: ['completed', 'failed', 'cancelled', 'rejected'] } },
                transaction: t
            });

            let assignedTask = null;
            if (existingTask) {
                // Revert previous agent's pending if changing agent
                if (existingTask.deliveryAgentId && existingTask.deliveryAgentId !== bestMatch.id) {
                    const oldShare = parseFloat(existingTask.agentShare) || 70;
                    const oldEarnings = (parseFloat(existingTask.deliveryFee) || 0) * (oldShare / 100);
                    await revertPending(existingTask.deliveryAgentId, oldEarnings, order.id, t);
                }

                await existingTask.update({
                    deliveryAgentId: bestMatch.id,
                    deliveryType: dType,
                    deliveryFee: finalFee,
                    agentShare: currentShare,
                    status: 'assigned',
                    assignedAt: new Date(),
                    notes: `Auto-assigned by Smart Dispatcher. Score: ${matches[0].score}`
                }, { transaction: t });
                assignedTask = existingTask;
            } else {
                assignedTask = await DeliveryTask.create({
                    orderId: order.id,
                    deliveryAgentId: bestMatch.id,
                    deliveryType: dType,
                    deliveryFee: finalFee,
                    agentShare: currentShare,
                    status: 'assigned',
                    assignedAt: new Date(),
                    notes: `Auto-assigned by Smart Dispatcher. Score: ${matches[0].score}`
                }, { transaction: t });
            }

            // 7. Financial records
            await upsertDeliveryChargeForTask({
                DeliveryCharge,
                transaction: t,
                order,
                task: assignedTask,
                deliveryFee: finalFee,
                agentSharePercent: currentShare,
                deliveryType: dType,
                deliveryAgentId: bestMatch.id
            });

            await invoiceSellerChargeImmediately({
                DeliveryCharge,
                Wallet,
                Transaction,
                transaction: t,
                task: assignedTask,
                order
            });

            // Credit pending earnings to agent
            if (agentEarnings > 0) {
                await creditPending(
                    bestMatch.id,
                    agentEarnings,
                    `Auto-assigned Delivery for Order #${order.orderNumber}`,
                    order.id,
                    t
                );
            }

            // Clear other requested tasks
            await DeliveryTask.update(
                { status: 'rejected', rejectionReason: 'Another agent was auto-assigned.' },
                { 
                    where: { 
                        orderId: order.id, 
                        status: 'requested',
                        id: { [Op.ne]: assignedTask.id }
                    }, 
                    transaction: t 
                }
            );

            await t.commit();

            // 8. Notifications (Outside transaction)
            await createNotification(
                bestMatch.id,
                'New Auto-Assignment 📦',
                `You have been auto-assigned Order #${order.orderNumber} based on your proximity and rating. Please accept quickly!`,
                'info'
            );
            await notifyDeliveryAgentAssignment(bestMatch.id, order, order.orderNumber, dType);

            // Real-time socket
            const { getIO } = require('../realtime/socket');
            const io = getIO();
            if (io) {
                io.to(`user:${bestMatch.id}`).emit('new_task_available', {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    deliveryType: dType,
                    autoAssigned: true
                });
                io.to('admin').emit('deliveryRequestUpdate', { orderId: order.id, status: 'auto_assigned' });
            }

            return assignedTask;

        } catch (error) {
            if (t) await t.rollback();
            console.error('❌ [AutoDispatch] Error:', error);
            return null;
        }
    }
};

module.exports = autoDispatchService;
