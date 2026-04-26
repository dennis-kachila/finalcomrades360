const fs = require('fs');
const path = require('path');
const { Notification, PlatformConfig, User } = require('../models');
const { sendMessage } = require('./messageService');
const { getDynamicMessage, getEnabledChannels } = require('./templateUtils');
const { sendEmail } = require('./mailer');
const { getIO } = require('../realtime/socket');
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
            } else if (order) {
                logNotify(`SELF-HEAL: No User ID, using direct order details (Marketing/Guest)`);
            }
        }

        const message = await getDynamicMessage(templateKey, data.defaultTemplate || '', data);
        
        // Priority for phone/email: 
        // 1. Order direct (Guest/Marketing) -> This is critical as Marketing orders use req.body fields
        // 2. Resolved User (if available)
        const rawPhone = order?.customerPhone || order?.marketingPhone || customer.phone || order?.User?.phone;
        const rawEmail = order?.customerEmail || order?.marketingEmail || customer.email || order?.User?.email;

        // Strip placeholder values created when a user registers without phone/email
        const isPlaceholderPhone = !rawPhone || String(rawPhone).startsWith('nophone_');
        const isPlaceholderEmail = !rawEmail || String(rawEmail).startsWith('noemail_');
        const customerPhone = isPlaceholderPhone ? null : rawPhone;
        const customerEmail = isPlaceholderEmail ? null : rawEmail;

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

        // Emit real-time notification via Socket.IO
        try {
            const io = getIO();
            if (io) {
                console.log(`[Notification] Emitting real-time notification to user_${userId}`);
                io.to(`user_${userId}`).emit('notification:new', {
                    id: notification.id,
                    title,
                    message,
                    type,
                    createdAt: notification.createdAt,
                    read: false
                });
                
                // Also emit a general data-update event for background sync
                io.emit('realtime:data-updated', { scope: 'notifications', userId });
            }
        } catch (socketErr) {
            console.error('[Notification] Socket emission failed:', socketErr.message);
        }

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
    const name = customer?.name || order.customerName || 'Customer';
    const phone = customer?.phone || order.customerPhone;
    const customerInfo = `${name}${phone ? (', ' + phone) : ''}`;
    const deliveryLocation = order.deliveryMethod === 'pick_station' 
        ? (order.pickStation || 'N/A') 
        : (order.deliveryAddress || order.marketingDeliveryAddress || 'N/A');

    const paymentMethod = order.paymentType === 'cash_on_delivery' ? 'Cash on Delivery' : 'Paid';

    const siteUrl = process.env.FRONTEND_URL || 'https://comrades360.shop';
    const trackUrl = `${siteUrl}/track/${order.orderNumber}`;

    const defaultTemplate = `Hello {name}, your order #{orderNumber} has been placed successfully! 🛍️\n\nItems:\n{itemsList}\n\nTotal: KES {total}\nPayment: {paymentMethod}\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryLocation}\n\nTrack your order here: {trackUrl}`;

    await sendCustomerNotificationAcrossChannels('orderPlaced', {
        name: name,
        orderNumber: order.orderNumber,
        itemsList: itemNames || `${itemsCount} items`,
        total: order.total?.toLocaleString() || '0',
        paymentMethod,
        deliveryMethod,
        deliveryLocation,
        trackUrl,
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
        name: order.User?.name || order.customerName || 'Customer',
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
async function notifyCustomerMarketerCreated(userOrId, tempPassword, loginIdentifier, marketerName = 'A Marketer') {
    // Accept either a full User object (fast path, no extra DB query) or a plain userId
    let user;
    if (userOrId && typeof userOrId === 'object' && userOrId.id) {
        user = userOrId;
    } else {
        user = await User.findByPk(userOrId);
    }
    const customerName = user?.name || 'Customer';
    const userId = user?.id || userOrId;

    const defaultTemplate = `HELLO {name}, Your Comrades360 Account has been successfully created by {marketerName}. \n\nYour temporary password is: {tempPassword}\n\nPlease login at {loginUrl} and change your password immediately to secure your account.\n\nWelcome to the Comrades360 family!`;
    
    const loginUrl = `${process.env.FRONTEND_URL || 'https://comrades360.shop'}/login`;

    await sendCustomerNotificationAcrossChannels('WELCOME_MARKETER_CREATED', {
        name: customerName,
        marketerName,
        loginIdentifier,
        tempPassword,
        loginUrl,
        title: 'Your Comrades360 Account! 🛍️',
        type: 'success',
        defaultTemplate
    }, user || { id: userId });
}

/**
 * Notify customer that their account was created via Google and provide temp password
 */
async function notifyCustomerGoogleSignup(user, tempPassword) {
    const defaultTemplate = `Welcome to Comrades360! 🌟\n\nHello {name}, you have successfully joined our community using Google.\n\nIf you ever want to log in without Google, your temporary password is:\n\n{tempPassword}\n\nWe recommend changing this in your account settings after your first login.\n\nThank you for choosing Comrades360!`;

    await sendCustomerNotificationAcrossChannels('googleWelcome', {
        name: user.name || 'Friend',
        tempPassword,
        title: 'Welcome to Comrades360! 🌟',
        type: 'success',
        defaultTemplate
    }, user);
}

/**
 * Notify marketer that they have successfully placed an order for a customer
 */
async function notifyMarketerOrderPlaced(order, marketer, customerName) {
    if (!marketer || !order) return;

    const defaultTemplate = `Success! 🚀 You have successfully placed order #{orderNumber} for {customerName}.\n\nTotal: KES {total}\nItems: {itemsCount}\n\nKeep growing your network on Comrades360!`;

    await sendCustomerNotificationAcrossChannels('marketerOrderPlaced', {
        name: marketer.name || 'Marketer',
        orderNumber: order.orderNumber,
        customerName: customerName || order.customerName || 'your customer',
        total: order.total?.toLocaleString() || '0',
        itemsCount: order.itemsCount || 'the selected items',
        title: 'Order Placed Successfully! 🚀',
        type: 'success',
        defaultTemplate
    }, marketer, null); // We pass null as order here because we want to notify the MARKETER directly using their details
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
    notifyCustomerGoogleSignup,
    notifyMarketerOrderPlaced,
    logNotify,
    sendCustomerNotificationAcrossChannels
};
