const { Order, OrderItem, User } = require('../models');
const { Op } = require('sequelize');
const { notifyCustomerOrderThankYou } = require('../utils/notificationHelpers');

/**
 * Get potential thank you message recipients for today
 */
const getPotentialRecipients = async (req, res) => {
    try {
        const { type = 'all' } = req.query; // 'all', 'product', 'fastfood'
        
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const whereClause = {
            status: 'delivered',
            [Op.or]: [
                {
                    actualDelivery: {
                        [Op.between]: [startOfDay, endOfDay]
                    }
                },
                {
                    [Op.and]: [
                        { actualDelivery: null },
                        {
                            updatedAt: {
                                [Op.between]: [startOfDay, endOfDay]
                            }
                        }
                    ]
                }
            ]
        };

        const includeItems = {
            model: OrderItem,
            as: 'OrderItems'
        };

        if (type === 'product') {
            includeItems.where = { itemType: 'product' };
        } else if (type === 'fastfood') {
            includeItems.where = { itemType: 'fastfood' };
        }

        const orders = await Order.findAll({
            where: whereClause,
            include: [
                includeItems,
                { model: User, as: 'user', attributes: ['name', 'phone', 'email'] }
            ],
            order: [['updatedAt', 'DESC']]
        });

        // Filter out orders that don't match the type strictly if needed (Sequelize where in include might do it)
        // But for 'all', we want all delivered today.
        
        return res.json({
            success: true,
            count: orders.length,
            orders: orders.map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                customerName: o.customerName || o.user?.name,
                customerPhone: o.customerPhone || o.user?.phone,
                deliveredAt: o.updatedAt,
                itemType: o.OrderItems[0]?.itemType || 'unknown'
            }))
        });
    } catch (error) {
        console.error('[adminMarketingNotificationController] Error fetching recipients:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch recipients' });
    }
};

/**
 * Send bulk thank you messages
 */
const sendBulkThankYouMessages = async (req, res) => {
    try {
        const { orderIds, type = 'all' } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No orders selected' });
        }

        const orders = await Order.findAll({
            where: {
                id: { [Op.in]: orderIds },
                status: 'delivered'
            },
            include: [{ model: User, as: 'user' }]
        });

        let successCount = 0;
        let failCount = 0;

        for (const order of orders) {
            try {
                // Determine item type if not provided
                let detectedType = type;
                if (type === 'all') {
                    const firstItem = await OrderItem.findOne({ where: { orderId: order.id } });
                    detectedType = firstItem?.itemType || 'product';
                }

                await notifyCustomerOrderThankYou(order, detectedType);
                successCount++;
            } catch (err) {
                console.error(`Failed to send thank you to order ${order.orderNumber}:`, err);
                failCount++;
            }
        }

        return res.json({
            success: true,
            message: `Processed ${orders.length} messages. Success: ${successCount}, Failed: ${failCount}`,
            summary: { success: successCount, failed: failCount }
        });
    } catch (error) {
        console.error('[adminMarketingNotificationController] Error sending bulk messages:', error);
        res.status(500).json({ success: false, message: 'Failed to send messages' });
    }
};

module.exports = {
    getPotentialRecipients,
    sendBulkThankYouMessages
};
