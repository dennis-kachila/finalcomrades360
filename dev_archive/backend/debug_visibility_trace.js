const { Order, DeliveryAgentProfile, User, DeliveryTask, OrderItem, Product, FastFood, Service } = require('./models');
const { calculateDistance, getTownCoordinates } = require('./utils/deliveryUtils');
const { Op } = require('sequelize');

async function debug() {
    const brianId = 1000;
    const orderId = 52;
    
    console.log('--- DEBUGGING VISIBILITY FOR ORDER 52 vs BRIAN ---');
    
    const user = await User.findByPk(brianId);
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: brianId } });
    
    if (!profile) { console.log('Brian profile not found'); return; }
    if (!profile.isActive) { console.log('Brian profile marked as INACTIVE'); }
    
    const DELIVERY_AVAILABLE_ORDER_STATUSES = ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'en_route_to_pick_station', 'at_pick_station', 'awaiting_delivery_assignment', 'processing', 'at_warehouse', 'ready_for_pickup', 'in_transit', 'failed', 'returned' ];
    
    const order = await Order.findByPk(orderId, {
        include: [
            { model: User, as: 'seller' },
            { model: DeliveryTask, as: 'deliveryTasks' }
        ]
    });
    
    if (!order) { console.log('Order 52 not found'); return; }
    
    console.log('Order Status:', order.status);
    console.log('Order is in Whitelist?', DELIVERY_AVAILABLE_ORDER_STATUSES.includes(order.status));
    console.log('Order Assigned To:', order.deliveryAgentId);
    
    // Proximity 
    const loc = JSON.parse(profile.currentLocation || '{}');
    const activeLat = loc.lat;
    const activeLng = loc.lng;
    console.log('Brian Location:', activeLat, activeLng);
    
    let pickupLat = order.seller?.businessLat;
    let pickupLng = order.seller?.businessLng;
    console.log('Seller Location:', pickupLat, pickupLng);
    
    if (activeLat && activeLng && pickupLat && pickupLng) {
        const dist = calculateDistance(activeLat, activeLng, parseFloat(pickupLat), parseFloat(pickupLng));
        console.log('Calculated Distance:', dist.toFixed(3), 'km');
        console.log('Brian Max Distance:', profile.maxDeliveryDistance, 'km');
        console.log('Within Distance?', dist <= (profile.maxDeliveryDistance || 10));
    } else {
        console.log('Unable to calculate distance. Missing coordinates.');
    }
    
    // Locking
    const LOCKED_DELIVERY_TASK_STATUSES = ['accepted', 'in_progress'];
    const activeTasks = order.deliveryTasks.filter(t => ['requested', 'assigned', 'accepted', 'in_progress'].includes(t.status));
    const lockedTasks = order.deliveryTasks.filter(t => LOCKED_DELIVERY_TASK_STATUSES.includes(t.status));
    
    console.log('Active Tasks:', activeTasks.length);
    console.log('Locked Tasks:', lockedTasks.length);
    console.log('Is Locked by logic?', lockedTasks.length > 0);
    
    // The "isLocked" check (line 223/278 in deliveryController.js)
    const isLocked = lockedTasks.length > 0;
    const isAssignedToMe = order.deliveryAgentId === brianId;
    
    console.log('Final Visibility Condition Pass:');
    console.log(' - !isLocked:', !isLocked);
    console.log(' - AgentId != Me:', order.deliveryAgentId !== brianId);
    console.log(' - Distance Pass:', (dist <= profile.maxDeliveryDistance));
    
    if (!isLocked && order.deliveryAgentId !== brianId) {
        console.log('RESULT: Order 52 SHOULD BE VISIBLE to Brian.');
    } else if (isLocked) {
        console.log('RESULT: Order 52 is HIDDEN because it is LOCKED (accepted/in_progress).');
    } else if (order.deliveryAgentId === brianId) {
        console.log('RESULT: Order 52 is HIDDEN because it is ALREADY assigned to Brian.');
    }
}

debug().catch(e => console.error(e));
