const fs = require('fs');
const path = require('path');
const { Notification, PlatformConfig, User } = require('../models');
const { sendMessage } = require('./messageService');
const { getDynamicMessage, getEnabledChannels } = require('./templateUtils');
const { sendEmail } = require('./mailer');
/**
 * File-based diagnostic logging
 */
function logNotify(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(path.join(__dirname, '../notification_debug.log'), logLine);
        console.log(`🔔 ${message}`);
    } catch (e) {
        console.warn('Failed to write to notification_debug.log', e.message);
    }
}

/**
 * Universal helper to send a customer notification across all enabled channels
 */
async function sendCustomerNotificationAcrossChannels(templateKey, data, customerSource, order = null) {
    const orderNumber = order?.orderNumber || data.orderNumber || 'N/A';
    logNotify(`START: Event=${templateKey} | Order=${orderNumber}`);

    try {
        const channels = await getEnabledChannels(templateKey);
        const logChannels = Object.entries(channels).filter(([_, v]) => v !== false).map(([k]) => k).join(', ');
        logNotify(`CONFIG: Enabled=${logChannels || 'NONE'}`);

        // 1. Resolve Customer Data (Self-Healing)
        let customer = customerSource || {};
        const userId = customer.id || order?.userId;
        
        if (!customer.phone || !customer.email) {
            if (userId) {
                logNotify(`SELF-HEAL: Fetching User ID ${userId}...`);
                const fullUser = await User.findByPk(userId);
                if (fullUser) {
                    customer = fullUser;
                    logNotify(`SELF-HEAL: Resolved User=${customer.name}`);
                }
            }
        }

        const message = await getDynamicMessage(templateKey, data.defaultTemplate || '', data);
        
        // Priority for phone/email: 1. Order direct (Guest/Marketing) 2. Resolved User
        const customerPhone = order?.customerPhone || order?.marketingPhone || customer.phone || order?.User?.phone;
        const customerEmail = order?.customerEmail || order?.marketingEmail || customer.email || order?.User?.email;

        logNotify(`RECIPIENT: ID=${userId || 'GUEST'} | Phone=${customerPhone || 'MISSING'} | Email=${customerEmail || 'MISSING'}`);

        if (!customerPhone && !customerEmail && !userId) {
            logNotify(`ABORT: No contact details or User ID found.`);
            return;
        }

        const runWithTimeout = (promise, channelName) => {
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT (10s)')), 10000)
            );
            return Promise.race([promise, timeout])
                .then(() => logNotify(`SUCCESS: ${channelName}`))
                .catch(e => logNotify(`FAILED: ${channelName} -> ${e.message}`));
        };

        const promises = [];

        // 1. In-App Notification
        if (channels.in_app !== false && (customer.id || userId)) {
            logNotify(`DISPATCH: Attempting In-App...`);
            promises.push(runWithTimeout(
                createNotification(
                    customer.id || userId,
                    data.title || 'Order Update',
                    message,
                    data.type || 'info'
                ),
                'In-App'
            ));
        }

        // 2. WhatsApp
        if (channels.whatsapp !== false && customerPhone) {
            logNotify(`DISPATCH: Attempting WhatsApp to ${customerPhone}...`);
            promises.push(runWithTimeout(
                sendMessage(customerPhone, message, 'whatsapp'),
                'WhatsApp'
            ));
        }

        // 3. SMS
        if (channels.sms !== false && customerPhone) {
            logNotify(`DISPATCH: Attempting SMS to ${customerPhone}...`);
            promises.push(runWithTimeout(
                sendMessage(customerPhone, message, 'sms'),
                'SMS'
            ));
        }

        // 4. Email
        if (channels.email !== false && customerEmail) {
            logNotify(`DISPATCH: Attempting Email to ${customerEmail}...`);
            promises.push(runWithTimeout(
                sendEmail(customerEmail, data.title || 'Order Update', message),
                'Email'
            ));
        }

        await Promise.allSettled(promises);
        logNotify(`FINISHED: All channels processed for ${orderNumber}\n`);

    } catch (err) {
        logNotify(`FATAL ERROR: ${err.message}`);
        console.error(`🚨 [Notification System Crash]`, err);
    }
}

/**
 * Create a notification for a user
 */
async function createNotification(userId, title, message, type = 'info') {
    try {
        const notification = await Notification.create({
            userId,
            title,
            message,
            type,
            read: false
        });
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
}

/**
 * Notify delivery agent about new task assignment
 */
async function notifyDeliveryAgentAssignment(agentOrId, orderOrId, optionalOrderNumber, optionalDeliveryType) {
    const agentId = typeof agentOrId === 'object' ? agentOrId.id : agentOrId;
    const orderNumber = typeof orderOrId === 'object' ? orderOrId.orderNumber : (optionalOrderNumber || orderOrId);
    const deliveryType = optionalDeliveryType || (typeof orderOrId === 'object' ? orderOrId.deliveryType : null);

    const typeLabels = {
        'warehouse_to_customer': 'Warehouse → Customer',
        'customer_to_warehouse': 'Customer → Warehouse',
        'seller_to_customer': 'Seller → Customer',
        'seller_to_warehouse': 'Seller → Warehouse',
        'warehouse_to_pickup_station': 'Warehouse → Pickup Station',
        'seller_to_pickup_station': 'Seller → Pickup Station',
        'customer_to_pickup_station': 'Customer → Pickup Station',
        'pickup_station_to_warehouse': 'Pickup Station → Warehouse'
    };

    const message = await getDynamicMessage('agentTaskAssigned', 
        `You have been assigned a new delivery task for order #{orderNumber}. Type: {deliveryType}`,
        { orderNumber, deliveryType: typeLabels[deliveryType] || deliveryType }
    );

    return await createNotification(
        agentId,
        'New Delivery Task Assigned',
        message,
        'info'
    );
}

/**
 * Notify admin when agent rejects a task
 */
async function notifyAdminTaskRejection(orderId, orderNumber, agentName, reason) {
    const admins = await User.findAll({
        where: { role: ['admin', 'super_admin', 'superadmin'] }
    });

    const message = await getDynamicMessage('adminTaskRejected',
        `Delivery agent {agentName} rejected task for order #{orderNumber}. Reason: {reason}`,
        { agentName, orderNumber, reason }
    );

    for (const admin of admins) {
        await createNotification(
            admin.id,
            'Delivery Task Rejected',
            message,
            'warning'
        );
    }
}

/**
 * Notify customer that the order has been placed (Structured receipt format)
 */
async function notifyCustomerOrderPlaced(order, customer, itemsCount, itemNames) {
    const deliveryMethod = order.deliveryMethod === 'pick_station' ? 'Pickup Station' : 'Home Delivery';
    const customerInfo = `${customer.name || order.customerName || 'Customer'}${customer.phone || order.customerPhone ? (', ' + (customer.phone || order.customerPhone)) : ''}`;
    const deliveryLocation = order.deliveryMethod === 'pick_station' 
        ? (order.pickStation || 'N/A') 
        : (order.deliveryAddress || order.marketingDeliveryAddress || 'N/A');

    const paymentMethod = order.paymentType === 'cash_on_delivery' ? 'Cash on Delivery' : 'Paid';

    const defaultTemplate = `Hello {name}, your order #{orderNumber} has been placed successfully! 🛍️\n\nItems:\n{itemsList}\n\nTotal: KES {total}\nPayment: {paymentMethod}\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryLocation}\n\nThank you for shopping with Comrades360!`;

    await sendCustomerNotificationAcrossChannels('orderPlaced', {
        name: customer.name || 'Customer',
        orderNumber: order.orderNumber,
        itemsList: itemNames || `${itemsCount} items`,
        total: order.total?.toLocaleString() || '0',
        paymentMethod,
        deliveryMethod,
        deliveryLocation,
        title: 'Order Placed 🛍️',
        type: 'success',
        defaultTemplate
    }, customer, order);
}

/**
 * Notify customer that seller confirmed the order
 */
async function notifyCustomerSellerConfirmed(order, seller) {
    const sellerName = seller?.businessName || seller?.name || 'The Seller';
    const defaultTemplate = `Hello {name}, good news! 🥗\n\nYour order #{orderNumber} has been confirmed by {sellerName} and is now being prepared.\n\nWe will notify you as soon as it is handed over to our delivery agent.\n\nThank you for choosing Comrades360!`;

    await sendCustomerNotificationAcrossChannels('sellerConfirmed', {
        name: order.User?.name || order.customerName || 'Customer',
        orderNumber: order.orderNumber,
        sellerName,
        title: 'Order Confirmed! 🥗',
        type: 'success',
        defaultTemplate
    }, { id: order.userId }, order);
}

/**
 * Notify customer that driver is out for delivery
 */
async function notifyCustomerOutForDelivery(order, agent) {
    const defaultTemplate = `Your order #{orderNumber} is on its way! 🚚\n\nHello {name}, your package has been collected by {agentName} ({agentPhone}) and is in transit.\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryAddress}\n\nPlease stay reachable for a smooth delivery!`;

    await sendCustomerNotificationAcrossChannels('orderInTransit', {
        name: order.User?.name || order.customerName || 'Customer',
        orderNumber: order.orderNumber,
        agentName: agent.name,
        agentPhone: agent.phone || 'N/A',
        deliveryMethod: order.deliveryMethod === 'pick_station' ? 'Pickup Station' : 'Home Delivery',
        deliveryAddress: order.deliveryAddress || order.marketingDeliveryAddress || 'Selected Location',
        title: 'Order In Transit 🚚',
        type: 'info',
        defaultTemplate
    }, { id: order.userId }, order);
}

/**
 * Notify customer that order is ready at pick station
 */
async function notifyCustomerReadyForPickupStation(order, station) {
    const defaultTemplate = `Your order #{orderNumber} is ready for collection! 📦\n\nHello {name}, your items have arrived at the pickup location and are ready for you.\n\nPickup Details:\nStation: {stationName}\nLocation: {stationLocation}\nContact: {stationPhone}\n\nSee you soon at Comrades360!`;

    await sendCustomerNotificationAcrossChannels('orderReadyPickup', {
        name: order.User?.name || order.customerName || 'Customer',
        orderNumber: order.orderNumber,
        stationName: station.name,
        stationLocation: station.location || station.address || 'N/A',
        stationPhone: station.phone || 'N/A',
        title: 'Ready for Collection 📦',
        type: 'success',
        defaultTemplate
    }, { id: order.userId }, order);
}

/**
 * Notify customer that the agent has arrived
 */
async function notifyCustomerAgentArrived(order, agent) {
    const defaultTemplate = `Your delivery agent {agentName} has arrived at your location! 📍\n\nPlease meet them to collect your order #{orderNumber}.\nAgent Phone: {phone}`;

    await sendCustomerNotificationAcrossChannels('agentArrived', {
        name: order.User?.name || 'Customer',
        agentName: agent.name,
        orderNumber: order.orderNumber,
        phone: agent.phone || 'N/A',
        title: 'Agent Arrived 📍',
        type: 'success',
        defaultTemplate
    }, { id: order.userId }, order);
}

/**
 * Notify customer that the order has been cancelled
 */
async function notifyCustomerOrderCancelled(order, reason) {
    const defaultTemplate = `Order Notification: Cancellation ❌\n\nHello {name}, we regret to inform you that order #{orderNumber} has been cancelled.\n\nCancellation Details:\nReason: {reason}\n\nWe apologize for the inconvenience and hope to serve you again soon.`;

    await sendCustomerNotificationAcrossChannels('orderCancelled', {
        name: order.User?.name || order.customerName || 'Customer',
        orderNumber: order.orderNumber,
        reason: reason || 'N/A',
        title: 'Order Cancelled ❌',
        type: 'alert',
        defaultTemplate
    }, { id: order.userId }, order);
}

/**
 * Notify customer about delivery status update (Legacy generic fallback)
 */
async function notifyCustomerDeliveryUpdate(customerId, orderNumber, status, message) {
    const statusTitles = {
        'accepted': 'Delivery Accepted',
        'in_progress': 'Delivery In Progress',
        'completed': 'Delivery Completed',
        'failed': 'Delivery Failed'
    };

    return await createNotification(
        customerId,
        statusTitles[status] || 'Delivery Update',
        message || `Your order #${orderNumber} status has been updated to: ${status}`,
        status === 'completed' ? 'success' : status === 'failed' ? 'alert' : 'info'
    );
}

/**
 * Notify customer that their account has been created by a marketer
 */
async function notifyCustomerMarketerCreated(userId, tempPassword, loginIdentifier, marketerName = 'A Marketer') {
    const defaultTemplate = `Hello {name}, your account has been created by {marketerName}. Your temporary password is: {tempPassword}. Please login at {loginUrl} and change your password immediately.`;
    
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/login`;

    await sendCustomerNotificationAcrossChannels('WELCOME_MARKETER_CREATED', {
        name: 'Customer', // Fallback name
        marketerName,
        loginIdentifier,
        tempPassword,
        loginUrl,
        title: 'Account Created! 🛍️',
        type: 'success',
        defaultTemplate
    }, { id: userId });
}

module.exports = { 
    createNotification,
    notifyDeliveryAgentAssignment,
    notifyAdminTaskRejection,
    notifyCustomerDeliveryUpdate,
    notifyCustomerOutForDelivery,
    notifyCustomerReadyForPickupStation,
    notifyCustomerOrderPlaced,
    notifyCustomerSellerConfirmed,
    notifyCustomerOrderCancelled,
    notifyCustomerMarketerCreated,
    logNotify,
    sendCustomerNotificationAcrossChannels
};
