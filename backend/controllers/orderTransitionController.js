const { Order, OrderItem, DeliveryTask, Warehouse, PickupStation, User, FastFoodPickupPoint, PlatformConfig, DeliveryCharge } = require('../models');
const { 
  notifyCustomerReadyForPickupStation,
  notifyCustomerOrderCancelled,
  notifyCustomerSellerConfirmed,
  notifyCustomerOutForDelivery,
  logNotify
} = require('../utils/notificationHelpers');
const { upsertDeliveryChargeForTask } = require('../utils/deliveryChargeHelpers');
const { Op } = require('sequelize');
const autoDispatchService = require('../services/autoDispatchService');

const DELIVERY_TASK_CREATION_STATUSES = new Set([
  'seller_confirmed',
  'super_admin_confirmed',
  'en_route_to_warehouse',
  'at_warehouse',
  'en_route_to_pick_station',
  'at_pick_station',
  'awaiting_delivery_assignment',
  'processing',
  'at_warehouse',
  'ready_for_pickup',
  'in_transit',
]);

/**
 * Valid status transitions by routing strategy
 * Ensures order moves through correct sequence based on adminRoutingStrategy
 */
const VALID_TRANSITIONS = {
  // Direct delivery: seller → customer (skip hubs)
  direct_delivery: {
    super_admin_confirmed: ['seller_confirmed'],
    seller_confirmed: ['in_transit'],
    in_transit: ['delivered', 'failed'],
    delivered: ['completed'],
    failed: ['cancelled'],
  },

  // Warehouse route: seller → warehouse → pick_station → customer
  warehouse: {
    seller_confirmed: ['en_route_to_warehouse'],
    en_route_to_warehouse: ['at_warehouse', 'failed'],
    at_warehouse: ['en_route_to_pick_station'],
    en_route_to_pick_station: ['at_pick_station', 'failed'],
    // At pick station: if customer chose pick_station delivery → ready_for_pickup
    // If customer chose home_delivery → awaiting_delivery_assignment
    at_pick_station: ['ready_for_pickup', 'awaiting_delivery_assignment'],
    ready_for_pickup: ['completed'],
    awaiting_delivery_assignment: ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered: ['completed'],
    failed: ['cancelled'],
  },

  // Pick station route: seller → pick_station → customer
  pick_station: {
    seller_confirmed: ['en_route_to_pick_station'],
    en_route_to_pick_station: ['at_pick_station', 'failed'],
    // At pick station: if customer chose pick_station delivery → ready_for_pickup
    // If customer chose home_delivery → awaiting_delivery_assignment
    at_pick_station: ['ready_for_pickup', 'awaiting_delivery_assignment'],
    ready_for_pickup: ['completed'],
    awaiting_delivery_assignment: ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered: ['completed'],
    failed: ['cancelled'],
  },

  // Fastfood pickup point: seller → fastfood_pickup_point → customer
  fastfood_pickup_point: {
    seller_confirmed: ['in_transit'], // Fastfood goes directly to pickup point via delivery
    in_transit: ['ready_for_pickup', 'awaiting_delivery_assignment'],
    ready_for_pickup: ['completed'],
    awaiting_delivery_assignment: ['in_transit', 'failed'],
    failed: ['cancelled'],
  },
};

/**
 * Validate if a status transition is allowed based on routing strategy
 */
const getValidTransitionsForOrder = (order) => {
  if (!order?.adminRoutingStrategy || !VALID_TRANSITIONS[order.adminRoutingStrategy]) {
    return [];
  }

  const currentStatus = order.status;
  const routingStrategy = order.adminRoutingStrategy;
  const deliveryMethod = order.deliveryMethod;
  const routeViaPickStation = !!(order.destinationPickStationId || order.pickupStationId);
  const baseTransitions = VALID_TRANSITIONS[routingStrategy][currentStatus] || [];

  if (routingStrategy === 'warehouse' && currentStatus === 'at_warehouse') {
    return routeViaPickStation || deliveryMethod === 'pick_station'
      ? ['en_route_to_pick_station']
      : ['awaiting_delivery_assignment'];
  }

  if ((routingStrategy === 'warehouse' || routingStrategy === 'pick_station') && currentStatus === 'at_pick_station') {
    return deliveryMethod === 'home_delivery'
      ? ['awaiting_delivery_assignment']
      : ['ready_for_pickup'];
  }

  return baseTransitions;
};

const isValidTransition = (currentStatus, nextStatus, routingStrategy, deliveryMethod = null) => {
  if (!routingStrategy || !VALID_TRANSITIONS[routingStrategy]) {
    return false;
  }

  const allowedNextStatuses = getValidTransitionsForOrder({
    status: currentStatus,
    adminRoutingStrategy: routingStrategy,
    deliveryMethod,
  });

  return allowedNextStatuses.includes(nextStatus);
};

const deriveTaskRouteDetails = async (order, status) => {
  const currentStatus = status || order.status;
  const routeViaPickStation = !!(order.destinationPickStationId || order.pickupStationId);

  if (order.adminRoutingStrategy === 'direct_delivery') {
    return {
      deliveryType: 'seller_to_customer',
      pickupLocation: order.seller?.businessAddress || 'Seller Address',
      deliveryLocation: order.deliveryAddress,
    };
  }

  if (order.adminRoutingStrategy === 'warehouse') {
    if (['awaiting_delivery_assignment', 'in_transit', 'processing', 'at_warehouse'].includes(currentStatus)) {
      if (routeViaPickStation || order.deliveryMethod === 'pick_station') {
        const warehouse = order.destinationWarehouseId ? await Warehouse.findByPk(order.destinationWarehouseId) : null;
        const pickStation = order.destinationPickStationId ? await PickupStation.findByPk(order.destinationPickStationId) : null;
        return {
          deliveryType: 'warehouse_to_pickup_station',
          pickupLocation: warehouse?.address || warehouse?.landmark || 'Warehouse Hub',
          deliveryLocation: pickStation?.location || pickStation?.address || 'Pickup Station',
        };
      }

      if (order.deliveryMethod === 'home_delivery') {
        const warehouse = order.destinationWarehouseId ? await Warehouse.findByPk(order.destinationWarehouseId) : null;
        return {
          deliveryType: 'warehouse_to_customer',
          pickupLocation: warehouse?.address || warehouse?.landmark || 'Warehouse Hub',
          deliveryLocation: order.deliveryAddress,
        };
      }
    }

    const warehouse = order.destinationWarehouseId ? await Warehouse.findByPk(order.destinationWarehouseId) : null;
    return {
      deliveryType: 'seller_to_warehouse',
      pickupLocation: order.seller?.businessAddress || 'Seller Address',
      deliveryLocation: warehouse?.address || warehouse?.landmark || 'Warehouse Hub',
    };
  }

  if (order.adminRoutingStrategy === 'pick_station') {
    if (['awaiting_delivery_assignment', 'in_transit'].includes(currentStatus) && order.deliveryMethod === 'home_delivery') {
      const pickStation = order.destinationPickStationId ? await PickupStation.findByPk(order.destinationPickStationId) : null;
      return {
        deliveryType: 'pickup_station_to_customer',
        pickupLocation: pickStation?.location || pickStation?.address || 'Pickup Station',
        deliveryLocation: order.deliveryAddress,
      };
    }

    const pickStation = order.destinationPickStationId ? await PickupStation.findByPk(order.destinationPickStationId) : null;
    return {
      deliveryType: 'seller_to_pickup_station',
      pickupLocation: order.seller?.businessAddress || 'Seller Address',
      deliveryLocation: pickStation?.location || pickStation?.address || 'Pickup Station',
    };
  }

  if (order.adminRoutingStrategy === 'fastfood_pickup_point') {
    const pickupPoint = order.destinationFastFoodPickupPointId ? await FastFoodPickupPoint.findByPk(order.destinationFastFoodPickupPointId) : null;
    if (['awaiting_delivery_assignment', 'in_transit'].includes(currentStatus) && order.deliveryMethod === 'home_delivery') {
      return {
        deliveryType: 'pickup_station_to_customer',
        pickupLocation: pickupPoint?.address || 'Fastfood Pickup Point',
        deliveryLocation: order.deliveryAddress,
      };
    }

    return {
      deliveryType: 'seller_to_pickup_station',
      pickupLocation: order.seller?.businessAddress || 'Seller Address',
      deliveryLocation: pickupPoint?.address || 'Fastfood Pickup Point',
    };
  }

  return {
    deliveryType: 'last_mile',
    pickupLocation: order.seller?.businessAddress || 'Seller Address',
    deliveryLocation: order.deliveryAddress,
  };
};

/**
 * Auto-create delivery task once order enters seller-confirmed delivery lifecycle.
 */
const autoCreateDeliveryTask = async (order, fromStatus, toStatus) => {
  try {
    if (!DELIVERY_TASK_CREATION_STATUSES.has(toStatus)) {
      return null;
    }

    if (!order.sellerConfirmed && toStatus !== 'seller_confirmed') {
      return null;
    }

    // Check if task already exists (avoid duplicates)
    const existingTask = await DeliveryTask.findOne({
      where: { 
        orderId: order.id,
        status: { [Op.notIn]: ['completed', 'failed', 'cancelled'] }
      }
    });

    if (existingTask) {
      return existingTask;
    }

    // Fetch configuration for fees and shares
    const [routeFeesConfig, agentShareConfig] = await Promise.all([
      PlatformConfig.findOne({ where: { key: 'delivery_route_fees' } }),
      PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' } })
    ]);

    let routeFees = {};
    try {
      routeFees = routeFeesConfig ? (typeof routeFeesConfig.value === 'string' ? JSON.parse(routeFeesConfig.value) : routeFeesConfig.value) : {};
    } catch (e) {
      console.error('[orderTransitionController] Error parsing delivery_route_fees:', e);
    }

    const lockedAgentShare = agentShareConfig ? parseFloat(agentShareConfig.value) : 70;

    const routeDetails = await deriveTaskRouteDetails(order, toStatus);
    const dType = routeDetails.deliveryType;

    // Determine the delivery fee for this specific leg
    let taskDeliveryFee = 0;
    
    // 1. Check for specific logistics route fees in PlatformConfig
    if (routeFees[dType] && routeFees[dType].fee !== undefined) {
      taskDeliveryFee = parseFloat(routeFees[dType].fee);
    } else {
      // 2. Fallback to terminal customer-facing fees if it's a terminal leg
      const terminalRoutes = ['seller_to_customer', 'warehouse_to_customer', 'pickup_station_to_customer', 'fastfood_pickup_point'];
      if (terminalRoutes.includes(dType)) {
        taskDeliveryFee = parseFloat(order.deliveryFee) || 0;
      }
    }

    // Create delivery task
    const task = await DeliveryTask.create({
      orderId: order.id,
      deliveryAgentId: null,
      status: 'pending',
      deliveryType: dType,
      pickupLocation: routeDetails.pickupLocation,
      deliveryLocation: routeDetails.deliveryLocation,
      deliveryFee: taskDeliveryFee,
      agentShare: lockedAgentShare,
      notes: `Auto-created at ${toStatus} for routing strategy: ${order.adminRoutingStrategy}`,
    });

    console.log(`[orderTransitionController] Auto-created delivery task: ${task.id} for order ${order.orderNumber} with fee ${taskDeliveryFee} and share ${lockedAgentShare}%`);

    // Ensure financial charge record is created in quoted status
    try {
      await upsertDeliveryChargeForTask({
        DeliveryCharge,
        order,
        task,
        deliveryFee: taskDeliveryFee,
        agentSharePercent: lockedAgentShare,
        deliveryType: dType,
        deliveryAgentId: null
      });
    } catch (chargeErr) {
      console.error(`[orderTransitionController] Failed to upsert delivery charge for task ${task.id}:`, chargeErr);
    }

    return task;
  } catch (error) {
    console.error('[orderTransitionController] Error auto-creating delivery task:', error);
    return null;
  }
};

/**
 * Transition order status with validation and auto-tasks
 */
const transitionOrderStatus = async (req, res) => {
  try {
    const routeOrderId = req.params.orderId;
    const { orderId: bodyOrderId, newStatus } = req.body;
    const orderId = routeOrderId || bodyOrderId;

    if (!orderId || !newStatus) {
      return res.status(400).json({
        success: false,
        message: 'orderId (path or body) and newStatus are required.',
      });
    }

    const { ORDER_SOCKET_INCLUDES, formatOrderSocketData } = require('../utils/orderHelpers');
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'seller', attributes: ['businessAddress', 'businessName'] },
        { model: OrderItem, as: 'OrderItems' },
        ...ORDER_SOCKET_INCLUDES
      ],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Check if transition is valid based on routing strategy
    if (!isValidTransition(order.status, newStatus, order.adminRoutingStrategy, order.deliveryMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition from ${order.status} to ${newStatus} for routing strategy ${order.adminRoutingStrategy}.`,
        validTransitions: getValidTransitionsForOrder(order),
      });
    }

    // Auto-create delivery task if needed
    let createdTask = null;
    if (newStatus === 'awaiting_delivery_assignment') {
      createdTask = await autoCreateDeliveryTask(order, order.status, newStatus);
      
      // NEW: Trigger Smart Auto-Dispatch if enabled
      try {
        const configRecord = await PlatformConfig.findOne({ where: { key: 'logistic_settings' } });
        const settings = configRecord ? (typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value) : {};
        if (settings.autoDispatchOrders) {
          // Fire and forget auto-dispatch to avoid blocking the transition response
          autoDispatchService.runAutoDispatch(order.id).catch(err => console.error('[AutoDispatch] Failed:', err));
        }
      } catch (e) {
        console.error('[AutoDispatch] Config check failed:', e);
      }
    }

    const fromStatus = order.status;

    // Update order status
    const updatedOrder = await order.update({
      status: newStatus,
      updatedAt: new Date(),
    });

    // Log tracking update
    const trackingUpdates = (() => {
      try {
        const raw = order.trackingUpdates;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') return JSON.parse(raw);
      } catch (_) {
        return [];
      }
    })();

    trackingUpdates.push({
      status: newStatus,
      message: `Order status transitioned to ${newStatus}`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user?.id || 'system',
      deliveryTaskCreated: createdTask ? createdTask.id : null,
    });

    await updatedOrder.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      const socketPayload = formatOrderSocketData(updatedOrder);
      io.to(`user:${updatedOrder.userId}`).emit('orderStatusUpdate', socketPayload);
      io.to('admin').emit('orderStatusUpdate', socketPayload);
      if (updatedOrder.sellerId) {
        io.to(`user:${updatedOrder.sellerId}`).emit('orderStatusUpdate', socketPayload);
      }
    }

    // Trigger Notifications for specific transitions
    try {
      logNotify(`TRANSITION: ${order.orderNumber} -> ${newStatus}`);
      if (newStatus === 'ready_for_pickup') {
          const station = updatedOrder.destinationPickStationId 
            ? await PickupStation.findByPk(updatedOrder.destinationPickStationId) 
            : (updatedOrder.destinationFastFoodPickupPointId ? await FastFoodPickupPoint.findByPk(updatedOrder.destinationFastFoodPickupPointId) : null);
          if (station) await notifyCustomerReadyForPickupStation(updatedOrder, station);
      } else if (newStatus === 'cancelled') {
          await notifyCustomerOrderCancelled(updatedOrder, 'Status updated by admin');
      } else if (newStatus === 'seller_confirmed' && fromStatus === 'order_placed') {
          const seller = await User.findByPk(updatedOrder.sellerId);
          await notifyCustomerSellerConfirmed(updatedOrder, seller);
      } else if (newStatus === 'in_transit') {
          // Fetch assigned agent if not loaded
          const agent = updatedOrder.deliveryAgent || await User.findByPk(updatedOrder.deliveryAgentId);
          if (agent) {
              await notifyCustomerOutForDelivery(updatedOrder, agent);
          } else {
              logNotify(`⚠️ [In Transit] Warning: No agent found for order ${updatedOrder.orderNumber}`);
          }
      }
    } catch (notifyErr) {
      logNotify(`⚠️ [Transition Notif] Failure: ${notifyErr.message}`);
      console.warn('[orderTransitionController] Notification failed:', notifyErr.message);
    }

    return res.json({
      success: true,
      message: `Order transitioned to ${newStatus}.`,
      order: updatedOrder,
      createdDeliveryTask: createdTask,
    });
  } catch (error) {
    console.error('[orderTransitionController] Error transitioning order:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to transition order status.',
      error: error.message,
    });
  }
};

/**
 * Get valid next transitions for current order
 */
const getValidTransitions = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const validNextStatuses = getValidTransitionsForOrder(order);

    return res.json({
      success: true,
      orderId,
      currentStatus: order.status,
      adminRoutingStrategy: order.adminRoutingStrategy,
      validTransitions: validNextStatuses,
    });
  } catch (error) {
    console.error('[orderTransitionController] Error getting valid transitions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get valid transitions.',
    });
  }
};

module.exports = {
  transitionOrderStatus,
  getValidTransitions,
  getValidTransitionsForOrder,
  isValidTransition,
  autoCreateDeliveryTask,
  VALID_TRANSITIONS,
};
