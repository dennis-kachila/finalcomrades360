const cron = require('node-cron');
const { Product, Notification, User, DeletedProduct, DeletedFastFood, Order, OrderItem, HandoverCode, DeliveryTask, Payment, DeliveryCharge, PlatformConfig, SupportMessage, sequelize } = require('../models');
const { revertPending } = require('../utils/walletHelpers');
const { Op } = require('sequelize');
const autoDispatchService = require('../services/autoDispatchService');

const initScheduledTasks = () => {
    console.log('⏰ Initializing scheduled tasks...');

    // Run every day at 9:00 AM - Low Stock Check
    cron.schedule('0 9 * * *', async () => {
        console.log('🔔 Running daily low stock check...');
        try {
            // Find all products with stock <= lowStockThreshold AND stock > 0
            // We use COALESCE to default lowStockThreshold to 5 if null
            const products = await Product.findAll({
                where: {
                    stock: {
                        [Op.gt]: 0,
                        [Op.lte]: sequelize.fn('COALESCE', sequelize.col('lowStockThreshold'), 5)
                    },
                    isActive: true,
                    approved: true
                },
                include: [{
                    model: User,
                    as: 'seller',
                    attributes: ['id', 'name', 'email']
                }]
            });

            console.log(`📊 Found ${products.length} low stock products.`);

            // Group by seller to avoid spamming
            const sellerProductsMap = {};

            for (const product of products) {
                if (!product.sellerId) continue;

                if (!sellerProductsMap[product.sellerId]) {
                    sellerProductsMap[product.sellerId] = {
                        seller: product.seller,
                        items: []
                    };
                }
                sellerProductsMap[product.sellerId].items.push(product);
            }

            // Create notifications for each seller
            const notifications = [];
            const now = new Date();

            for (const sellerId in sellerProductsMap) {
                const { seller, items } = sellerProductsMap[sellerId];

                if (!seller) continue;

                // If only 1 item, specific message. If multiple, summary message.
                let title, message;

                if (items.length === 1) {
                    title = 'Low Stock Alert';
                    message = `Your product "${items[0].name}" is running low (${items[0].stock} remaining). Please restock soon.`;
                } else {
                    title = 'Low Stock Alert - Multiple Items';
                    message = `You have ${items.length} products running low on stock. Please check your inventory dashboard.`;
                }

                notifications.push({
                    userId: parseInt(sellerId),
                    type: 'stock_alert',
                    title: title,
                    message: message,
                    read: false,
                    createdAt: now,
                    updatedAt: now
                });
            }

            if (notifications.length > 0) {
                await Notification.bulkCreate(notifications);
                console.log(`✅ Created ${notifications.length} low stock notifications.`);
            }

        } catch (error) {
            console.error('❌ Error in daily low stock check:', error);
        }
    });

    // Run every day at 3:00 AM - Recycle Bin Cleanup
    // Permanently delete items that have reached their autoDeleteAt timestamp
    cron.schedule('0 3 * * *', async () => {
        console.log('🧹 Running daily recycle bin cleanup...');
        try {
            const now = new Date();
            // 1. Products
            const deletedProductsCount = await DeletedProduct.destroy({
                where: {
                    autoDeleteAt: {
                        [Op.lte]: now
                    }
                }
            });

            // 2. Fast Food
            const deletedFastFoodsCount = await DeletedFastFood.destroy({
                where: {
                    autoDeleteAt: {
                        [Op.lte]: now
                    }
                }
            });

            if (deletedProductsCount > 0 || deletedFastFoodsCount > 0) {
                console.log(`✅ Permanently deleted ${deletedProductsCount} products and ${deletedFastFoodsCount} fast food items from recycle bin.`);
            }
        } catch (error) {
            console.error('❌ Error in recycle bin cleanup:', error);
        }
    });

    // Run every day at 4:00 AM - Auto-complete delivered orders after 7 days
    cron.schedule('0 4 * * *', async () => {
        console.log('📦 Running daily order auto-completion check...');
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Find orders delivered more than 7 days ago that are still in 'delivered' status
            const [updatedCount] = await Order.update(
                { status: 'completed' },
                {
                    where: {
                        status: 'delivered',
                        actualDelivery: {
                            [Op.lte]: sevenDaysAgo
                        }
                    }
                }
            );

            if (updatedCount > 0) {
                console.log(`✅ Auto-completed ${updatedCount} orders past the 7-day return window.`);
            }
        } catch (error) {
            console.error('❌ Error in order auto-completion check:', error);
        }
    });

    // Run every day at 2:00 AM - Database Backup
    cron.schedule('0 2 * * *', async () => {
        console.log('💾 Running daily database backup...');
        try {
            const { backupSQLite, backupMySQL, backupUploads, rotateBackups } = require('../scripts/backup-database');
            const { sequelize } = require('../database/database');

            const dialect = sequelize.options.dialect;
            if (dialect === 'sqlite') {
                await backupSQLite();
            } else if (dialect === 'mysql') {
                await backupMySQL();
            }

            await backupUploads();
            await rotateBackups();

            console.log('✅ Daily backup completed successfully');
        } catch (error) {
            console.error('❌ Error in daily backup:', error);
        }
    });

    // Run every day at 5:00 AM - Support Message History Cleanup (1 Month Retention)
    cron.schedule('0 5 * * *', async () => {
        console.log('💬 Running daily support message cleanup...');
        try {
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const deletedCount = await SupportMessage.destroy({
                where: {
                    createdAt: {
                        [Op.lte]: oneMonthAgo
                    }
                }
            });

            if (deletedCount > 0) {
                console.log(`✅ Cleaned up ${deletedCount} support messages older than 1 month.`);
            }
        } catch (error) {
            console.error('❌ Error in support message cleanup:', error);
        }
    });

    // Run every 15 minutes - Cleanup Expired Stock Reservations
    cron.schedule('*/15 * * * *', async () => {
        console.log('🔄 Running stock reservation cleanup...');
        try {
            const { cleanupExpiredReservations } = require('../controllers/inventoryController');
            await cleanupExpiredReservations();
        } catch (error) {
            console.error('❌ Error in stock reservation cleanup:', error);
        }
    });

    // Run every 30 minutes - Process Payment Retry Queue
    cron.schedule('*/30 * * * *', async () => {
        console.log('💳 Processing payment retry queue...');
        try {
            const { processRetryQueue } = require('../controllers/paymentEnhancementsController');
            await processRetryQueue();
        } catch (error) {
            console.error('❌ Error in payment retry queue processing:', error);
        }
    });

    // Run every day at 10:00 AM - Enhanced Low Stock Notifications
    cron.schedule('0 10 * * *', async () => {
        console.log('📊 Running enhanced low stock check...');
        try {
            const { checkLowStockAndNotify } = require('../controllers/inventoryController');
            await checkLowStockAndNotify();
        } catch (error) {
            console.error('❌ Error in enhanced low stock check:', error);
        }
    });

    // Run every 5 minutes - Auto-expire unaccepted delivery task assignments + Auto-Reassignment broadcast
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { Order, DeliveryTask, PlatformConfig, DeliveryAgentProfile, Notification } = require('../models');
            const { getIO } = require('../realtime/socket');

            // Get per-type expiry times from config
            const config = await PlatformConfig.findOne({ where: { key: 'logistic_settings' } });
            let fastfoodExpiryMinutes = 5;
            let productExpiryMinutes = 30;
            let settings = {};
            if (config) {
                try {
                    settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
                    if (settings.fastfoodTaskExpiryMinutes) fastfoodExpiryMinutes = parseInt(settings.fastfoodTaskExpiryMinutes, 10);
                    if (settings.productTaskExpiryMinutes) productExpiryMinutes = parseInt(settings.productTaskExpiryMinutes, 10);
                } catch (e) {
                    console.error('[DeliveryExpiry] Failed to parse logistic_settings:', e.message);
                }
            }

            // Use the smaller threshold to find all candidates — we'll filter per-task below
            const earliestThreshold = new Date(Date.now() - fastfoodExpiryMinutes * 60 * 1000);

            const expiredTasks = await DeliveryTask.findAll({
                where: {
                    status: 'assigned',
                    assignedAt: { [Op.lte]: earliestThreshold }
                },
                include: [{
                    model: Order,
                    as: 'order',
                    include: [{ model: OrderItem, as: 'OrderItems', attributes: ['id', 'fastFoodId', 'productId'] }]
                }]
            });

            if (expiredTasks.length === 0) return;

            // Filter: apply the correct timeout per order type
            const now = Date.now();
            const trulyExpired = expiredTasks.filter(task => {
                if (!task.order || !task.assignedAt) return false;
                const isFastfood = (task.order.OrderItems || []).some(i => i.fastFoodId != null);
                const thresholdMs = (isFastfood ? fastfoodExpiryMinutes : productExpiryMinutes) * 60 * 1000;
                return (now - new Date(task.assignedAt).getTime()) >= thresholdMs;
            });

            if (trulyExpired.length === 0) return;

            console.log(`⏰ [DeliveryExpiry] Expiring ${trulyExpired.length} unaccepted tasks (fastfood: ${fastfoodExpiryMinutes}min, product: ${productExpiryMinutes}min)...`);

            // --- Find online agents for broadcast ---
            const onlineAgents = await DeliveryAgentProfile.findAll({
                where: { isActive: true },
                attributes: ['id', 'userId', 'location']
            });
            const onlineAgentUserIds = onlineAgents.map(a => a.userId);

            const io = getIO();

            for (const task of trulyExpired) {
                await task.update({ status: 'failed' });

                if (task.order) {
                    const revertStatus = task.order.sellerConfirmed ? 'seller_confirmed' : 'order_placed';
                    await task.order.update({
                        deliveryAgentId: null,
                        status: revertStatus
                    });
                    console.log(`↩️  Order #${task.order.orderNumber} reverted to '${revertStatus}' — agent did not accept in time.`);

                    // NEW: Trigger Smart Auto-Dispatch if enabled
                    if (settings.autoDispatchOrders) {
                        // Exclude the agent who just timed out
                        autoDispatchService.runAutoDispatch(task.order.id, { excludeAgentIds: [task.deliveryAgentId] }).catch(err => console.error('[AutoDispatch] Failed:', err));
                    }

                    // --- AUTO-REASSIGNMENT: Broadcast to all online agents ---
                    if (io && onlineAgentUserIds.length > 0) {
                        const broadcastPayload = {
                            orderId: task.order.id,
                            orderNumber: task.order.orderNumber,
                            deliveryAddress: task.order.deliveryAddress,
                            deliveryType: task.deliveryType,
                            message: `📦 Order #${task.order.orderNumber} needs a delivery agent. Be the first to accept!`
                        };

                        // Notify each online agent via their personal socket room
                        for (const agentUserId of onlineAgentUserIds) {
                            io.to(`user_${agentUserId}`).emit('new_task_available', broadcastPayload);
                        }

                        console.log(`📡 [AutoReassign] Broadcasted order #${task.order.orderNumber} to ${onlineAgentUserIds.length} online agents.`);

                        // Also notify admin room
                        io.to('admin_room').emit('task_auto_expired', {
                            orderId: task.order.id,
                            orderNumber: task.order.orderNumber,
                            message: `Task for order #${task.order.orderNumber} expired. Broadcasted to ${onlineAgentUserIds.length} online agents.`
                        });
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error in delivery task expiry cleanup:', error);
        }
    });

    // Run every 2 minutes - Catch orders stuck in 'awaiting_delivery_assignment'
    // and trigger auto-dispatch if Smart Mode is enabled.
    cron.schedule('*/2 * * * *', async () => {
        try {
            const config = await PlatformConfig.findOne({ where: { key: 'logistic_settings' } });
            if (!config) return;

            const settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
            if (!settings.autoDispatchOrders) return;

            // Find orders in 'awaiting_delivery_assignment' or 'seller_confirmed' status
            // For seller_confirmed, we only want those that DO NOT have an active delivery task.
            const stuckOrders = await Order.findAll({
                where: {
                    status: { [Op.in]: ['awaiting_delivery_assignment', 'seller_confirmed'] }
                },
                include: [{
                    model: DeliveryTask,
                    as: 'deliveryTasks',
                    required: false
                }],
                attributes: ['id', 'orderNumber', 'status']
            });

            // Filter out seller_confirmed orders that already have an active task
            const validStuckOrders = stuckOrders.filter(order => {
                if (order.status === 'awaiting_delivery_assignment') return true;
                // If it's seller_confirmed, it's only stuck if there are no delivery tasks or only failed/cancelled ones
                const hasActiveTask = order.deliveryTasks && order.deliveryTasks.some(t => !['completed', 'failed', 'cancelled', 'rejected'].includes(t.status));
                return !hasActiveTask;
            });

            if (validStuckOrders.length > 0) {
                console.log(`🔄 [AutoDispatch-Cron] Found ${validStuckOrders.length} orders awaiting assignment. Triggering Smart Mode...`);
                for (const order of validStuckOrders) {
                    // First, try to auto-create task if it doesn't exist
                    try {
                        const { autoCreateDeliveryTask } = require('../controllers/orderTransitionController');
                        await autoCreateDeliveryTask(order, 'order_placed', order.status);
                    } catch (e) {
                        console.error(`[AutoDispatch-Cron] Failed to create task for #${order.orderNumber}:`, e);
                    }

                    autoDispatchService.runAutoDispatch(order.id).catch(err =>
                        console.error(`[AutoDispatch-Cron] Failed dispatch for #${order.orderNumber}:`, err)
                    );
                }
            }
        } catch (error) {
            console.error('❌ Error in auto-dispatch stuck orders cron:', error);
        }
    });

    // Run every hour - Auto-Cancel Unpaid Prepay Orders
    cron.schedule('0 * * * *', async () => {
        console.log('🕒 Running auto-cancel unpaid orders check...');
        try {
            // Get auto-cancel threshold from config (default 24 hours)
            const config = await PlatformConfig.findOne({ where: { key: 'logistic_settings' } });
            let cancelHours = 24;
            if (config) {
                try {
                    const settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
                    if (settings.autoCancelUnpaidHours) {
                        cancelHours = parseFloat(settings.autoCancelUnpaidHours);
                    }
                } catch (e) {
                    console.error('[AutoCancel] Failed to parse logistic_settings:', e.message);
                }
            }

            const threshold = new Date(Date.now() - cancelHours * 60 * 60 * 1000);

            // Find unconfirmed prepay orders older than threshold
            const unpaidOrders = await Order.findAll({
                where: {
                    paymentConfirmed: false,
                    paymentType: 'prepay',
                    status: { [Op.notIn]: ['cancelled', 'failed', 'delivered', 'completed'] },
                    createdAt: { [Op.lte]: threshold }
                },
                include: [{
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product, as: 'Product' }]
                }]
            });

            if (unpaidOrders.length === 0) return;

            console.log(`🕒 [AutoCancel] Found ${unpaidOrders.length} unpaid orders to cancel (threshold: ${cancelHours}h).`);

            for (const order of unpaidOrders) {
                const t = await sequelize.transaction();
                try {
                    // 1. Update order status
                    await order.update({
                        status: 'cancelled',
                        cancelledAt: new Date(),
                        cancelReason: `Auto-cancelled by system: Payment not confirmed within ${cancelHours} hours.`,
                        cancelledBy: 'system',
                        deliveryAgentId: null
                    }, { transaction: t });

                    // 2. Restore Stock
                    for (const item of order.OrderItems || []) {
                        if ((item.itemType === 'product' || item.productId) && item.Product) {
                            await item.Product.update({
                                stock: item.Product.stock + (item.quantity || 0)
                            }, { transaction: t });
                        }
                    }

                    // 3. Revert Pending Wallet Credits
                    const sellerPayout = Number(order.total || 0) - Number(order.deliveryFee || 0);
                    if (sellerPayout > 0 && order.sellerId) {
                        await revertPending(order.sellerId, sellerPayout, order.id, t);
                    }

                    // Revert Delivery Agent Credits
                    const charges = await DeliveryCharge.findAll({ where: { orderId: order.id }, transaction: t });
                    for (const charge of charges) {
                        if (charge.payeeUserId && charge.agentAmount > 0) {
                            await revertPending(charge.payeeUserId, charge.agentAmount, order.id, t);
                        }
                        await charge.update({
                            fundingStatus: 'reversed',
                            note: 'System auto-cancelled: Unpaid order timeout'
                        }, { transaction: t });
                    }

                    // 4. Update Delivery Tasks
                    await DeliveryTask.update(
                        { status: 'cancelled', notes: 'System auto-cancelled: Unpaid order timeout' },
                        { where: { orderId: order.id, status: { [Op.notIn]: ['delivered', 'completed', 'cancelled'] } }, transaction: t }
                    );

                    // 5. Update Payment records
                    await Payment.update(
                        { status: 'cancelled', failureReason: 'Payment timeout' },
                        { where: { orderId: order.id, status: ['pending', 'processing'] }, transaction: t }
                    );

                    await t.commit();

                    // Real-time notification to user
                    try {
                        const { getIO } = require('../realtime/socket');
                        const io = getIO();
                        if (io) {
                            io.to(`user:${order.userId}`).emit('orderStatusUpdate', {
                                orderId: order.id,
                                status: 'cancelled',
                                orderNumber: order.orderNumber,
                                autoCancelled: true
                            });
                        }
                    } catch (_) { }

                    console.log(`✅ [AutoCancel] Order #${order.orderNumber} auto-cancelled successfully.`);

                } catch (innerErr) {
                    await t.rollback();
                    console.error(`❌ [AutoCancel] Failed for order #${order.orderNumber}:`, innerErr.message);
                }
            }
        } catch (error) {
            console.error('❌ Error in auto-cancel unpaid orders cron:', error);
        }
    });

    // Run every 30 minutes - Stuck Delivery Detector
    // Finds tasks stuck in 'in_progress' for too long and alerts admin WITHOUT auto-failing them
    cron.schedule('*/30 * * * *', async () => {
        try {
            const { DeliveryTask, PlatformConfig, Notification, User } = require('../models');
            const { getIO } = require('../realtime/socket');

            // Get stuck threshold from config (default 3 hours)
            const config = await PlatformConfig.findOne({ where: { key: 'logistic_settings' } });
            let stuckHours = 3;
            if (config) {
                try {
                    const settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
                    if (settings.stuckDeliveryHours) {
                        stuckHours = parseInt(settings.stuckDeliveryHours, 10);
                    }
                } catch (e) { }
            }

            const stuckThreshold = new Date(Date.now() - stuckHours * 60 * 60 * 1000);

            const stuckTasks = await DeliveryTask.findAll({
                where: {
                    status: 'in_progress',
                    startedAt: { [Op.lte]: stuckThreshold }
                },
                include: [
                    { model: Order, as: 'order', attributes: ['id', 'orderNumber', 'deliveryAddress'] },
                    { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone'] }
                ]
            });

            if (stuckTasks.length === 0) return;

            console.log(`🚨 [StuckDetector] Found ${stuckTasks.length} deliveries stuck in progress!`);

            // Find all admin users to notify
            const admins = await User.findAll({
                where: { role: { [Op.in]: ['admin', 'super_admin', 'superadmin'] } },
                attributes: ['id']
            });

            const io = getIO();

            for (const task of stuckTasks) {
                const agentName = task.deliveryAgent?.name || 'Unknown Agent';
                const orderNumber = task.order?.orderNumber || task.orderId;
                const hoursElapsed = stuckHours;
                const title = '🚨 Delivery Stuck Alert';
                const message = `Order #${orderNumber} has been in transit for over ${hoursElapsed} hours (Agent: ${agentName}). Manual follow-up may be needed.`;

                // Create DB notification for each admin
                for (const admin of admins) {
                    // Avoid duplicate alerts — check if one was sent in the last hour
                    const recentAlert = await Notification.findOne({
                        where: {
                            userId: admin.id,
                            type: 'stuck_delivery',
                            createdAt: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) }
                        }
                    });
                    if (recentAlert) continue; // Skip if recently alerted

                    await Notification.create({
                        userId: admin.id,
                        title,
                        message,
                        type: 'stuck_delivery'
                    });
                }

                // Real-time push to admin dashboard
                if (io) {
                    io.to('admin_room').emit('stuck_delivery_alert', {
                        taskId: task.id,
                        orderId: task.order?.id,
                        orderNumber,
                        agentName,
                        agentPhone: task.deliveryAgent?.phone,
                        hoursElapsed,
                        message
                    });
                }

                console.log(`🚨 [StuckDetector] Alert sent for order #${orderNumber} (Agent: ${agentName}).`);
            }
        } catch (error) {
            console.error('❌ Error in stuck delivery detector:', error);
        }
    });

    // Run every 4 minutes - Revert Pending Wallet Credits
    cron.schedule('0 4 * * *', async () => {
        console.log('⏰ Running wallet credit reversion task...');
        try {
            const pendingOrders = await Order.findAll({
                where: { status: 'pending' },
                include: [{ model: User, as: 'seller' }]
            });

            for (const order of pendingOrders) {
                await revertPending(order.sellerId, order.totalAmount, order.id);
            }

            console.log('✅ Wallet credits reverted for pending orders.');
        } catch (error) {
            console.error('❌ Error reverting wallet credits:', error);
        }
    });

    console.log('✅ Scheduled tasks initialized.');

    // ─── DISABLED: Auto-confirm agent→customer delivery after 5 min ──
    // This was causing the handover section to disappear prematurely for customers
    // if there was any slight time desync or if the delivery took longer than 5 mins.

    // cron.schedule('*/2 * * * *', async () => {
    //     try {
    //         const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    //
    //         // Find pending agent_to_customer codes that are 5+ minutes old
    //         const staleCodes = await HandoverCode.findAll({
    //             where: {
    //                 handoverType: 'agent_to_customer',
    //                 status: 'pending',
    //                 createdAt: { [Op.lte]: fiveMinutesAgo }
    //             },
    //             include: [
    //                 { model: Order, as: 'order' },
    //                 { model: DeliveryTask, as: 'task' }
    //             ]
    //         });
    //
    //         if (staleCodes.length === 0) return;
    //
    //         console.log(`🚚 [AutoDeliver] Auto-confirming ${staleCodes.length} unconfirmed delivery handovers (5-min rule)...`);
    //
    //         for (const handoverCode of staleCodes) {
    //             const t = await sequelize.transaction();
    //             try {
    //                 // Mark code as confirmed (system-auto)
    //                 await handoverCode.update({
    //                     status: 'confirmed',
    //                     confirmerId: handoverCode.initiatorId, // agent self-confirms as system action
    //                     confirmedAt: new Date(),
    //                     notes: 'Auto-confirmed: customer did not enter code within 5 minutes.'
    //                 }, { transaction: t });
    //
    //                 // Update order to delivered
    //                 if (handoverCode.order) {
    //                     await handoverCode.order.update({
    //                         status: 'delivered',
    //                         actualDelivery: new Date()
    //                     }, { transaction: t });
    //
    //                     // Notify customer
    //                     try {
    //                         await Notification.create({
    //                             userId: handoverCode.order.userId,
    //                             title: '✅ Order Delivered',
    //                             message: `Your order #${handoverCode.order.orderNumber} has been marked as delivered.`,
    //                             type: 'success'
    //                         }, { transaction: t });
    //                     } catch (_) {}
    //                 }
    //
    //                 // Complete the delivery task
    //                 if (handoverCode.task) {
    //                     await handoverCode.task.update({
    //                         status: 'completed',
    //                         completedAt: new Date()
    //                     }, { transaction: t });
    //                 }
    //
    //                 await t.commit();
    //
    //                 // Real-time push
    //                 try {
    //                     const { getIO } = require('../realtime/socket');
    //                     const io = getIO();
    //                     if (io && handoverCode.order) {
    //                         io.to(`user:${handoverCode.order.userId}`).emit('orderStatusUpdate', {
    //                             orderId: handoverCode.order.id,
    //                             status: 'delivered',
    //                             orderNumber: handoverCode.order.orderNumber,
    //                             autoDelivered: true
    //                         });
    //                         io.to('admin').emit('orderStatusUpdate', {
    //                             orderId: handoverCode.order.id,
    //                             status: 'delivered',
    //                             orderNumber: handoverCode.order.orderNumber,
    //                             autoDelivered: true
    //                         });
    //                     }
    //                 } catch (_) {}
    //
    //                 console.log(`✅ [AutoDeliver] Order #${handoverCode.order?.orderNumber} auto-delivered.`);
    //             } catch (innerErr) {
    //                 await t.rollback();
    //                 console.error(`❌ [AutoDeliver] Failed for handover ${handoverCode.id}:`, innerErr.message);
    //             }
    //         }
    //     } catch (error) {
    //         console.error('❌ [AutoDeliver] Error in auto-delivery cron:', error);
    // });
};

module.exports = { initScheduledTasks };

