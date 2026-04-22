const models = require('../models');
const { Order, OrderItem, User, DeliveryAgentProfile, DeliveryTask, DeliveryCharge, Warehouse, Wallet, Transaction, Product, FastFood, Service, PlatformConfig, PickupStation, FastFoodPickupPoint } = models;
const { Op } = require('sequelize');
const { sequelize } = require('../database/database');
const { matchAgentsToOrder, isAgentAvailableNow, checkProfileCompleteness, calculateDistance, getTownCoordinates } = require('../utils/deliveryUtils');
const { 
  notifyDeliveryAgentAssignment, 
  notifyAdminTaskRejection, 
  notifyCustomerDeliveryUpdate, 
  notifyCustomerReadyForPickupStation,
  notifyCustomerAgentArrived,
  notifyCustomerOutForDelivery
} = require('../utils/notificationHelpers');
const { creditPending, moveToSuccess, revertPending } = require('../utils/walletHelpers');
const { SELLER_PAID_ROUTE_TYPES, calculateSellerMerchandisePayout, settleDeliveryChargeForTask, upsertDeliveryChargeForTask } = require('../utils/deliveryChargeHelpers');
const { creditAgentForTask } = require('../services/earningsService');
const { appendOrderTrackingUpdate } = require('../utils/trackingUpdates');

const DELIVERY_AVAILABLE_ORDER_STATUSES = [
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
  'failed',
  'returned'
];

// Statuses where an external (seller) dispatcher is physically in transit to the destination.
// While in these statuses WITH a selfDispatcherName set, the order must NOT be visible
// to delivery agents — it should only appear once the goods have arrived and been confirmed.
const EXTERNAL_DISPATCHER_TRANSIT_STATUSES = [
  'en_route_to_warehouse',     // dispatcher heading to warehouse
  'en_route_to_pick_station'   // dispatcher heading to pickup station
];

const ACTIVE_DELIVERY_TASK_STATUSES = ['requested', 'assigned', 'accepted', 'in_progress'];
const LOCKED_DELIVERY_TASK_STATUSES = ['accepted', 'in_progress'];

const getProvisionalDeliveryType = (order) => {
  const status = order?.status;
  const routing = order?.adminRoutingStrategy;
  const deliveryMethod = order?.deliveryMethod;

  if (routing === 'direct_delivery') {
    return 'seller_to_customer';
  }

  if (routing === 'warehouse') {
    // Hub-stage statuses: item is actually at the warehouse or being handled there.
    // Next leg starts from warehouse.
    const hubStageStatuses = ['at_warehouse', 'awaiting_delivery_assignment', 'processing', 'at_warehouse'];
    if (hubStageStatuses.includes(status)) {
      if (deliveryMethod === 'pick_station') {
        return 'warehouse_to_pickup_station';
      }
      return 'warehouse_to_customer';
    }
    
    // Leg 1 transitions: moving to hub or at station awaiting hub collection
    if (['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse'].includes(status)) {
      return 'seller_to_warehouse';
    }

    if (['en_route_to_pick_station', 'at_pick_station', 'ready_for_pickup'].includes(status)) {
      return deliveryMethod === 'home_delivery' ? 'pickup_station_to_customer' : 'warehouse_to_pickup_station';
    }

    // Final leg/delivered statuses
    if (['in_transit', 'in_transit', 'delivered'].includes(status)) {
      return 'warehouse_to_customer';
    }

    return 'seller_to_warehouse';
  }

  if (routing === 'pick_station') {
    if (deliveryMethod === 'home_delivery' && ['at_pick_station', 'ready_for_pickup', 'awaiting_delivery_assignment', 'in_transit'].includes(status)) {
      return 'pickup_station_to_customer';
    }
    return 'seller_to_pickup_station';
  }

  if (routing === 'fastfood_pickup_point') {
    if (deliveryMethod === 'home_delivery' && ['at_pick_station', 'ready_for_pickup', 'awaiting_delivery_assignment', 'in_transit'].includes(status)) {
      return 'pickup_station_to_customer';
    }
    return 'seller_to_pickup_station';
  }

  return 'seller_to_customer';
};

/**
 * Internal helper to process a delivery request approval.
 * Updates both the task and the order within a transaction if provided.
 */
const _approveDeliveryRequestInternal = async (task, { deliveryType, deliveryFee, notes, transaction } = {}) => {
  // Update the task to assigned status
  await task.update({
    status: 'assigned',
    deliveryType: (deliveryType || task.deliveryType),
    deliveryFee: (deliveryFee !== undefined ? deliveryFee : task.deliveryFee),
    agentNotes: (notes || task.agentNotes),
    assignedAt: new Date()
  }, { transaction });

  // Update the order with the agent assignment
  if (task.order) {
    await task.order.update({
      deliveryAgentId: task.deliveryAgentId,
      deliveryType: (deliveryType || task.deliveryType),
      deliveryFee: (deliveryFee !== undefined ? deliveryFee : task.order.deliveryFee)
    }, { transaction });
  }

  // Notify Agent (Notification logic is usually outside transaction if possible, but here we can return a flag or just do it)
  const { createNotification, notifyDeliveryAgentAssignment } = require('../utils/notificationHelpers');
  if (task.deliveryAgentId && task.order) {
    await createNotification(
      task.deliveryAgentId,
      'Delivery Request Approved',
      `Your request to deliver Order #${task.order.orderNumber} has been approved. Route: ${deliveryType || task.deliveryType}.`,
      'success'
    );

    let assignedType = deliveryType || task.deliveryType;
    await notifyDeliveryAgentAssignment(task.deliveryAgentId, task.order, task.order.orderNumber, assignedType);

    const { getIO } = require('../realtime/socket');
    getIO().to(`user:${task.deliveryAgentId}`).emit('deliveryRequestUpdate', {
      orderId: task.orderId,
      status: 'approved',
      taskId: task.id,
      deliveryType: (deliveryType || task.deliveryType)
    });
  }
  
  return task;
};

const orderItemIncludeConfig = [
  { model: Product, attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images'], required: false },
  { model: FastFood, attributes: ['id', 'name', 'mainImage'], required: false },
  { model: Service, attributes: ['id', 'title'], required: false }
];

const hydrateOrderItemsFallback = async (orders = []) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  return Promise.all(orders.map(async (entry) => {
    const plain = typeof entry?.get === 'function' ? entry.get({ plain: true }) : entry;
    if (!plain || typeof plain !== 'object') return plain;

    if (Array.isArray(plain.OrderItems) && plain.OrderItems.length > 0) {
      // Ensure each item has a coverImage for the frontend
      plain.OrderItems = plain.OrderItems.map(item => {
        if (item.FastFood) {
          item.FastFood.coverImage = item.FastFood.mainImage;
        } else if (item.Service) {
          if (Array.isArray(item.Service.images) && item.Service.images.length > 0) {
            item.Service.coverImage = item.Service.images[0].imageUrl || item.Service.images[0];
          }
        }
        return item;
      });
      return plain;
    }

    const recoveredItems = await OrderItem.findAll({
      where: { orderId: plain.id },
      include: [
        { model: Product, attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images'], required: false },
        { model: FastFood, attributes: ['id', 'name', 'mainImage'], required: false },
        { model: Service, attributes: ['id', 'title'], include: [{ model: ServiceImage, as: 'images', attributes: ['imageUrl'] }], required: false }
      ]
    });

    if (recoveredItems.length > 0) {
      plain.OrderItems = recoveredItems.map((item) => {
        const itemPlain = item.get({ plain: true });
        if (itemPlain.FastFood) {
          itemPlain.FastFood.coverImage = itemPlain.FastFood.mainImage;
        } else if (itemPlain.Service) {
          if (Array.isArray(itemPlain.Service.images) && itemPlain.Service.images.length > 0) {
            itemPlain.Service.coverImage = itemPlain.Service.images[0].imageUrl || itemPlain.Service.images[0];
          }
        }
        return itemPlain;
      });
    }

    return plain;
  }));
};


// GET /api/delivery/orders?status=
const listMyAssignedOrders = async (req, res) => {
  try {
    const { status, q, from, to, deliveryType } = req.query;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

    // Enforcement: Check agent online status and profile completeness
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile || !profile.isActive) {
      return res.json({
        data: [],
        meta: { page, pageSize, total: 0, totalPages: 0 },
        blockingReason: !profile ? 'Profile not created' : 'You are currently OFFLINE. Toggle ONLINE to manage assignments.'
      });
    }
    const { isComplete, missing } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      return res.json({
        data: [],
        meta: { page, pageSize, total: 0, totalPages: 0 },
        blockingReason: 'Your profile is incomplete. Please update details to continue working.',
        missingFields: missing
      });
    }

    const where = {};
    const isCancelled = req.query.cancelled === 'true';
    const isHistory = req.query.history === 'true';

    // Build the DeliveryTask child filter (association-level)
    let taskWhereClause = { deliveryAgentId: req.user.id };

    if (isCancelled) {
      // Cancelled tab: tasks this agent was assigned but failed or rejected
      taskWhereClause.status = { [Op.in]: ['failed', 'rejected'] };
    } else if (isHistory) {
      // Completed tab: tasks this agent completed
      taskWhereClause.status = 'completed';
    } else {
      // In Progress tab: tasks in active states
      taskWhereClause.status = { [Op.in]: ['assigned', 'accepted', 'arrived_at_pickup', 'in_progress'] };
      // Also match the order-level deliveryAgentId as the primary filter
      where.deliveryAgentId = req.user.id;
    }

    if (q) where.orderNumber = { [Op.like]: `%${q}%` };
    if (deliveryType) where.deliveryType = deliveryType;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { rows, count } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      include: [
        {
          model: OrderItem, as: 'OrderItems', 
          include: [
            { model: Product, attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images'], required: false },
            { model: FastFood, attributes: ['id', 'name', 'mainImage'], required: false },
            { model: Service, attributes: ['id', 'title'], required: false }
          ]
        },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role', 'phone', 'businessName'] },
        { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessCounty', 'businessTown', 'phone', 'email', 'businessLandmark', 'businessPhone', 'businessLat', 'businessLng', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
        { model: Warehouse, as: 'DestinationWarehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
        {
          model: DeliveryTask,
          as: 'deliveryTasks',
          where: taskWhereClause,
          required: true, // Always require a matching task — this is the key filter
        }
      ],
      order: [
        ['createdAt', 'DESC'],
        [{ model: DeliveryTask, as: 'deliveryTasks' }, 'createdAt', 'DESC']
      ],
      subQuery: false
    });
    const rowsWithItems = await hydrateOrderItemsFallback(rows);
    res.json({ data: rowsWithItems, meta: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } });
  } catch (e) {
    console.error('Error in listMyAssignedOrders:', e);
    res.status(500).json({ error: 'Failed to load orders', message: e.message, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
  }
};

// GET /api/delivery/available
const listAvailableOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));

    // 1. Check if agent is Online and has a complete profile
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });

    if (!profile || !profile.isActive) {
      return res.json({
        data: [],
        meta: { page, pageSize, total: 0, totalPages: 0 },
        blockingReason: !profile ? 'Profile not created' : 'You are currently OFFLINE. Toggle ONLINE to see orders.'
      });
    }

    const { isComplete, missing } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      console.log(`[listAvailableOrders] Profile incomplete for user ${req.user.id}. Missing: ${JSON.stringify(missing)}. Profile location: "${profile.location}", user phone: "${req.user.phone}"`);
      return res.json({
        data: [],
        meta: { page, pageSize, total: 0, totalPages: 0 },
        blockingReason: 'Your profile is incomplete. Please update your account details to start working.',
        missingFields: missing
      });
    }

    // Find orders that are ready for delivery.
    // We used to filter by deliveryAgentId: null, but now we show any order 
    // that isn't already "locked" (accepted/in-progress) by another agent.
    const where = {
      status: { [Op.in]: DELIVERY_AVAILABLE_ORDER_STATUSES },
      sellerConfirmed: true
    };

    const rows = await Order.findAll({
      where,
      order: [['createdAt', 'ASC']], // Default oldest first
      include: [
        {
          model: OrderItem, as: 'OrderItems',
          include: [
            { model: Product, attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images'], required: false },
            { model: FastFood, attributes: ['id', 'name', 'mainImage'], required: false },
            { model: Service, attributes: ['id', 'title'], required: false }
          ]
        },
        { model: User, as: 'user', attributes: ['id', 'name', 'phone', 'businessName'] }, // Customer details
        { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessCounty', 'businessTown', 'phone', 'businessLandmark', 'businessPhone', 'businessLat', 'businessLng', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
        { model: Warehouse, as: 'DestinationWarehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
        { model: FastFoodPickupPoint, as: 'DestinationFastFoodPickupPoint', attributes: ['id', 'name', 'address', 'contactPhone'] }
      ]
    });

    // Hide orders that already have an open request/assignment from any agent.
    // This prevents duplicate requests for the same delivery job.
    const orderIds = rows.map(o => o.id);
    let requestedSet = new Set();
    let lockedOrderSet = new Set();

    if (orderIds.length > 0) {
      const openTasks = await DeliveryTask.findAll({
        where: {
          orderId: { [Op.in]: orderIds },
          status: { [Op.in]: ACTIVE_DELIVERY_TASK_STATUSES }
        },
        attributes: ['orderId', 'deliveryAgentId']
      });

      requestedSet = new Set(openTasks
        .filter(t => t.deliveryAgentId === req.user.id)
        .map(t => t.orderId));
      
      // An order is "locked" only if an agent has already accepted it or is actively delivering it.
      // Pending requests or assignments that haven't been accepted yet are still "available" for others to see/request.
      lockedOrderSet = new Set(openTasks
        .filter(t => LOCKED_DELIVERY_TASK_STATUSES.includes(t.status))
        .map(t => t.orderId));

      // We also want to know if ANY agent has requested it, even if not yet locked.
      const requestedAnySet = new Set(openTasks
        .filter(t => t.status === 'requested')
        .map(t => t.orderId));

      rows.forEach(r => {
        const plain = r.get({ plain: true });
        r.hasAnyRequest = requestedAnySet.has(plain.id);
      });
    }

    const { lat: queryLat, lng: queryLng } = req.query;
    let fallbackLat = null, fallbackLng = null;

    // AUTOMATIC FALLBACK: Use profile's last synced location if GPS permission denied/missing
    if ((!queryLat || !queryLng) && profile.currentLocation) {
        try {
            const loc = JSON.parse(profile.currentLocation);
            if (loc && loc.lat && loc.lng) {
                fallbackLat = loc.lat;
                fallbackLng = loc.lng;
                console.debug(`[listAvailableOrders] Using profile fallback location for user ${req.user.id}`);
            }
        } catch (_) { }
    }

    const activeLat = parseFloat(queryLat || fallbackLat);
    const activeLng = parseFloat(queryLng || fallbackLng);

    const maxDistanceFromProfile = Number.isFinite(parseFloat(profile.maxDeliveryDistance))
      ? parseFloat(profile.maxDeliveryDistance)
      : null;
    const maxDistanceFromQuery = Number.isFinite(parseFloat(req.query.maxDistanceKm))
      ? parseFloat(req.query.maxDistanceKm)
      : null;
    const effectiveMaxDistanceKm = maxDistanceFromQuery || maxDistanceFromProfile;

    const rowsWithItems = await hydrateOrderItemsFallback(rows);

    const enhancedRows = rowsWithItems.map((plain, idx) => {
      const originalRow = rows[idx];
      plain.hasRequested = requestedSet.has(plain.id);
      plain.isLocked = lockedOrderSet.has(plain.id);
      plain.hasAnyRequest = originalRow.hasAnyRequest || false;

      // Determine pickup coordinates based on current status and routing
      let pickupLat = null, pickupLng = null;
      const status = plain.status;
      
      // If at warehouse/hub
      if (status === 'at_warehouse' || status === 'at_warehouse') {
        const hub = plain.DestinationWarehouse || plain.Warehouse;
        pickupLat = hub?.lat;
        pickupLng = hub?.lng;
      } 
      // If at pick station
      else if (status === 'at_pick_station' || status === 'ready_for_pickup') {
        const hub = plain.DestinationPickStation || plain.PickupStation || plain.DestinationFastFoodPickupPoint;
        // FastFoodPickupPoint might not have lat/lng but address. Fallback to town if needed
        pickupLat = hub?.lat;
        pickupLng = hub?.lng;

        if ((!pickupLat || !pickupLng) && hub) {
           const hubAddr = hub.location || hub.address;
           // If we have a landmark or generic address, we could geocode, but for now we fallback to seller logic if null
        }
      }
      
      // Fallback to Seller if coordinates still null (for order_placed, seller_confirmed, etc.)
      if (!pickupLat || !pickupLng) {
        pickupLat = plain.seller?.businessLat;
        pickupLng = plain.seller?.businessLng;
        
        // AUTOMATIC SELLER FALLBACK: Use town/county center if seller didn't pin accurately
        if (!pickupLat || !pickupLng) {
            const townCoords = getTownCoordinates(plain.seller?.businessTown, plain.seller?.businessCounty);
            if (townCoords) {
                pickupLat = townCoords.lat;
                pickupLng = townCoords.lng;
            }
        }
      }

      if (!isNaN(activeLat) && !isNaN(activeLng) && pickupLat && pickupLng) {
        const dist = calculateDistance(activeLat, activeLng, parseFloat(pickupLat), parseFloat(pickupLng));
        plain.distanceValue = dist;
        plain.distanceText = dist < 1 ? `${(dist * 1000).toFixed(0)}m away` : `${dist.toFixed(1)}km away`;
      } else {
        plain.distanceValue = null;
        plain.distanceText = 'Distance unknown';
      }

      return plain;
    })
      .filter((plain) => {
        // Hide orders that are locked or ALREADY requested by ANY agent.
        // This ensures that as soon as one agent requests an order, it disappears for all others.
        // Note: we check hasAnyRequest which includes the 'requested' status.
        return !plain.isLocked && !plain.hasAnyRequest;
      })
      .filter((plain) => {
        // Gate: hide orders where the seller is using an external dispatcher and
        // the goods have NOT yet arrived at the destination (warehouse or pickup station).
        // Once the dispatcher arrives and the status transitions (e.g. to at_warehouse,
        // at_warehouse, at_pick_station, ready_for_pickup), the order becomes visible.
        if (
          plain.selfDispatcherName &&
          EXTERNAL_DISPATCHER_TRANSIT_STATUSES.includes(plain.status)
        ) return false;
        return true;
      })
      .filter((plain) => {
        // Also hide orders that are ALREADY assigned to ME but not yet accepted.
        // These belong in "Active Assignments"/Notifications, not the general available pool.
        if (plain.deliveryAgentId === req.user.id) return false;
        
        // If we don't have agent location, we show everything (already handled by !activeLat check)
        // If we DO have agent location and a max distance filter, we only filter if we actually know the distance.
        // If distance is unknown, we show it (to avoid hiding orders with missing seller coordinates).
        if (!effectiveMaxDistanceKm || isNaN(activeLat) || isNaN(activeLng)) {
          return true;
        }
        if (plain.distanceValue === null) {
          return true; // SHOW if distance is unknown
        }
        return plain.distanceValue <= effectiveMaxDistanceKm;
      });

    // Sort by distance if location is known (either from query or profile)
    if (!isNaN(activeLat) && !isNaN(activeLng)) {
      enhancedRows.sort((a, b) => {
        if (a.distanceValue === null) return 1;
        if (b.distanceValue === null) return -1;
        return a.distanceValue - b.distanceValue;
      });
    }

    console.log(`[listAvailableOrders] Query executed. Statuses: ${JSON.stringify(where.status)}`);
    console.log(`[listAvailableOrders] Found ${enhancedRows.length} visible orders after lock and distance filters.`);

    const start = (page - 1) * pageSize;
    const pagedRows = enhancedRows.slice(start, start + pageSize);
    res.json({
      data: pagedRows,
      meta: {
        page,
        pageSize,
        total: enhancedRows.length,
        totalPages: Math.ceil(enhancedRows.length / pageSize)
      }
    });
  } catch (e) {
    console.error('Error in listAvailableOrders:', e);
    res.status(500).json({ error: 'Failed to load available orders' });
  }
};

// GET /api/delivery/profile
const getMyProfile = async (req, res) => {
  try {
    console.log('[getMyProfile] Fetching profile for user:', req.user.id);
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    console.log('[getMyProfile] Profile found:', profile ? profile.id : 'null');

    const profileData = profile ? profile.get({ plain: true }) : { userId: req.user.id, location: '', availability: null, isActive: false };
    const { isComplete, missing } = checkProfileCompleteness(profileData, req.user);

    res.json({
      ...profileData,
      isComplete,
      missingFields: missing
    });
  } catch (e) {
    console.error('[getMyProfile] Error:', e);
    console.error('[getMyProfile] Error stack:', e.stack);
    console.error('[getMyProfile] Error name:', e.name);
    console.error('[getMyProfile] Error message:', e.message);
    res.status(500).json({
      error: 'Failed to load profile',
      message: e.message,
      code: e.code,
      name: e.name
    });
  }
};

// PUT /api/delivery/profile
const upsertMyProfile = async (req, res) => {
  try {
    const {
      // Basic
      location, availability, isActive,
      // Vehicle
      vehicleType, vehiclePlate, maxLoadCapacity, vehicleModel, vehicleColor, insuranceExpiry,
      // Personal
      licenseNumber, emergencyContact, phone,
      // Payment
      bankName, accountNumber, accountName, mobileMoneyNumber, mobileMoneyProvider, paymentMethod,
      // Preferences
      maxDeliveryDistance, notificationSettings, preferredZones,
      // Location
      currentLocation
    } = req.body;

    console.log(`[upsertMyProfile] Received data for user ${req.user.id}:`, { location, vehicleType, paymentMethod, mobileMoneyNumber, emergencyContact });

    const payload = {};

    // Basic & Status
    if (typeof location === 'string') payload.location = location;
    if (availability != null) payload.availability = typeof availability === 'string' ? availability : JSON.stringify(availability);
    if (typeof isActive === 'boolean') payload.isActive = isActive;

    // Vehicle
    if (vehicleType) payload.vehicleType = vehicleType;
    if (vehiclePlate) payload.vehiclePlate = vehiclePlate;
    if (maxLoadCapacity != null && maxLoadCapacity !== '') {
      const parsed = parseFloat(maxLoadCapacity);
      if (!isNaN(parsed)) payload.maxLoadCapacity = parsed;
    }
    if (vehicleModel) payload.vehicleModel = vehicleModel;
    if (vehicleColor) payload.vehicleColor = vehicleColor;
    if (insuranceExpiry) payload.insuranceExpiry = new Date(insuranceExpiry);

    // Personal
    if (licenseNumber) payload.licenseNumber = licenseNumber;
    if (emergencyContact) payload.emergencyContact = emergencyContact;

    // Payment
    if (bankName) payload.bankName = bankName;
    if (accountNumber) payload.accountNumber = accountNumber;
    if (accountName) payload.accountName = accountName;
    if (mobileMoneyNumber) payload.mobileMoneyNumber = mobileMoneyNumber;
    if (mobileMoneyProvider) payload.mobileMoneyProvider = mobileMoneyProvider;
    if (paymentMethod) payload.paymentMethod = paymentMethod;

    // Preferences
    if (maxDeliveryDistance != null && maxDeliveryDistance !== '') {
      const parsed = parseFloat(maxDeliveryDistance);
      if (!isNaN(parsed)) payload.maxDeliveryDistance = parsed;
    }
    if (notificationSettings) payload.notificationSettings = typeof notificationSettings === 'string' ? notificationSettings : JSON.stringify(notificationSettings);
    if (preferredZones) payload.preferredZones = typeof preferredZones === 'string' ? preferredZones : JSON.stringify(preferredZones);

    // Location
    if (currentLocation != null) payload.currentLocation = typeof currentLocation === 'string' ? currentLocation : JSON.stringify(currentLocation);

    // If phone provided, also update the User model
    if (phone && typeof phone === 'string' && phone.trim()) {
      await req.user.update({ phone: phone.trim() });
    }

    const existing = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (existing) {
      await existing.update(payload);
      // Re-fetch to ensure Sequelize instance reflects DB state
      await existing.reload();
      // Get the latest user object (in case phone was just updated)
      const freshUser = await User.findByPk(req.user.id);
      const { isComplete, missing } = checkProfileCompleteness(existing, freshUser);
      console.log(`[upsertMyProfile] Profile completeness: isComplete=${isComplete}, missing=${JSON.stringify(missing)}`);
      return res.json({ message: 'Profile updated', profile: { ...existing.get({ plain: true }), isComplete, missingFields: missing } });
    }
    const created = await DeliveryAgentProfile.create({ userId: req.user.id, ...payload });
    const freshUser = await User.findByPk(req.user.id);
    const { isComplete, missing } = checkProfileCompleteness(created, freshUser);
    console.log(`[upsertMyProfile] Profile created. isComplete=${isComplete}, missing=${JSON.stringify(missing)}`);
    res.json({ message: 'Profile created', profile: { ...created.get({ plain: true }), isComplete, missingFields: missing } });
  } catch (e) {
    console.error('Error in upsertMyProfile:', e);
    res.status(500).json({ error: 'Failed to save profile', details: e.message });
  }
};

// PATCH /api/delivery/orders/:orderId/status
const updateMyOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    // Restrict cancellation to admins via admin endpoint only
    const allowedForAgent = ['processing', 'shipped', 'delivered', 'in_transit', 'in_transit'];
    if (!allowedForAgent.includes(status)) {
      return res.status(400).json({ error: 'Invalid status for delivery agent' });
    }
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.deliveryAgentId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your assigned order' });
    }

    // Enforcement: Agent must be ONLINE to update status
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile || !profile.isActive) {
      return res.status(403).json({ error: 'You must be ONLINE to manage deliveries.' });
    }
    const { isComplete } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      return res.status(403).json({ error: 'Profile incomplete. Please update details to continue working.' });
    }

    // Final delivery must be confirmed by customer handover code flow.
    if (status === 'delivered') {
      return res.status(400).json({
        error: 'Direct delivered status updates are disabled. Use customer handover code confirmation to complete delivery.'
      });
    }
    await order.update({ status });

    // Update associated delivery task if exists
    const task = await DeliveryTask.findOne({ where: { orderId: order.id, deliveryAgentId: req.user.id } });
    if (task) {
      if (status === 'delivered' && (task.status === 'completed' || task.completedAt)) {
        return res.status(400).json({ error: 'This delivery task has already been settled.' });
      }

      const taskStatus = status === 'delivered' ? 'completed' : (status === 'processing' || status === 'in_transit' || status === 'in_transit') ? 'in_progress' : task.status;

      const updates = {
        status: taskStatus,
        completedAt: status === 'delivered' ? new Date() : null,
        agentNotes: notes || task.agentNotes
      };

      // Calculate earnings if delivered (Legacy Support / Direct Admin Update)
      if (status === 'delivered') {
        try {
          await creditAgentForTask(task.id);
          
          // Unlink agent and update actual delivery date
          await order.update({
            deliveryAgentId: null,
            actualDelivery: new Date()
          });
        } catch (err) {
          console.error('Error crediting agent in updateMyOrderStatus:', err);
        }
      }

      await task.update(updates);
    }

    // Notify customer
    try {
      const { notifyCustomerDeliveryUpdate, notifyCustomerOutForDelivery } = require('../utils/notificationHelpers');
      if (status === 'in_transit') {
        await notifyCustomerOutForDelivery(order, req.user);
      } else {
        await notifyCustomerDeliveryUpdate(order.userId, order.orderNumber, status, `Your order #${order.orderNumber} is now ${status}`);
      }
    } catch (notifyErr) {
      console.warn('Notification failed:', notifyErr);
    }

    // Notify parties via Socket.IO
    try {
      const { getIO } = require('../realtime/socket');
      const io = getIO();
      if (io) {
        const payload = { orderId: order.id, status, orderNumber: order.orderNumber };
        io.to(`user:${order.userId}`).emit('orderStatusUpdate', payload);
        if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', payload);
        io.to('admin').emit('orderStatusUpdate', payload);
      }
    } catch (socketErr) {
      console.warn('Socket notification failed in updateMyOrderStatus:', socketErr.message);
    }

    res.json({ message: 'Status updated', status });
  } catch (e) {
    console.error('Error in updateMyOrderStatus:', e);

    // Check if headers already sent (in case of notification error inside try block? Unlikely but safe)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
};

// POST /api/delivery/tasks/:taskId/accept
const acceptDeliveryTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await DeliveryTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    // Check if agent is Online and has a complete profile
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile || !profile.isActive) {
      return res.status(403).json({ error: 'You must be ONLINE to accept tasks.' });
    }

    const { isComplete } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      return res.status(403).json({ error: 'Profile incomplete. Please update your account details.' });
    }

    if (task.status !== 'assigned') {
      return res.status(400).json({ error: 'Task cannot be accepted in current status' });
    }

    await task.update({
      status: 'accepted',
      acceptedAt: new Date()
    });

    // Lock share if missing (legacy support)
    if (!task.agentShare) {
      const { PlatformConfig } = require('../models');
      const config = await PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' } });
      const sharePercent = config ? parseFloat(config.value) : 70;
      await task.update({ agentShare: sharePercent });
    }

    // Notify customer
    if (task.order) {
      const currentStatus = task.order.status;
      const statusesToProcess = ['super_admin_confirmed', 'seller_confirmed', 'ready_for_pickup', 'order_placed'];
      
      if (statusesToProcess.includes(currentStatus)) {
        await task.order.update({ status: 'processing' });
        await notifyCustomerDeliveryUpdate(
          task.order.userId,
          task.order.orderNumber,
          'accepted',
          `Your delivery has been accepted by our delivery agent. Status: Processing.`
        );
      } else {
        console.log(`[acceptDeliveryTask] Skipping status update to 'processing' for order ${task.order.orderNumber}. Current status: ${currentStatus}`);
      }
    }

    res.json({ message: 'Task accepted successfully', task });
  } catch (e) {
    console.error('Error in acceptDeliveryTask:', e);
    res.status(500).json({ error: 'Failed to accept task' });
  }
};

// POST /api/delivery/tasks/:taskId/reject
const rejectDeliveryTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const task = await DeliveryTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }
    if (task.status !== 'assigned') {
      return res.status(400).json({ error: 'Task cannot be rejected in current status' });
    }

    const t = await sequelize.transaction();
    try {
      await task.update({
        status: 'rejected',
        rejectionReason: reason,
        deliveryAgentId: null // Unassign agent
      }, { transaction: t });

      // Revert wallet pending credit
      const share = parseFloat(task.agentShare) || 70;
      const earnings = (parseFloat(task.deliveryFee) || 0) * (share / 100);
      if (earnings > 0) {
        await revertPending(req.user.id, earnings, task.orderId, t);
      }

      // Unassign from order
      if (task.order) {
        await task.order.update({ deliveryAgentId: null }, { transaction: t });

        // Notify admins
        await notifyAdminTaskRejection(task.orderId, task.order.orderNumber, req.user.name, reason);
      }

      await t.commit();
      res.json({ message: 'Task rejected successfully', task });
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }
  } catch (e) {
    console.error('Error in rejectDeliveryTask:', e);
    res.status(500).json({ error: 'Failed to reject task' });
  }
};

// POST /api/delivery/orders/:orderId/request
const requestOrderAssignment = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1. Check if agent is Online and has a complete profile
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile || !profile.isActive) {
      return res.status(403).json({ error: 'You must be ONLINE to request assignments.' });
    }

    const { isComplete, missing } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      return res.status(403).json({
        error: 'Profile incomplete',
        message: 'Please complete your profile details before requesting orders.',
        missing
      });
    }

    const t = await sequelize.transaction();
    let task = null;
    let order = null;

    try {
      // Check if order exists and is unassigned
      order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!order) {
        await t.rollback();
        return res.status(404).json({ error: 'Order not found' });
      }
      if (order.deliveryAgentId) {
        await t.rollback();
        return res.status(400).json({ error: 'Order already assigned' });
      }
      if (!DELIVERY_AVAILABLE_ORDER_STATUSES.includes(order.status)) {
        await t.rollback();
        return res.status(400).json({ error: `Order is not open for delivery requests in status: ${order.status}` });
      }

      // Guard: reject if seller's external dispatcher hasn't delivered to the destination yet.
      // The order will become available once confirmed at the warehouse or pickup station.
      if (
        order.selfDispatcherName &&
        EXTERNAL_DISPATCHER_TRANSIT_STATUSES.includes(order.status)
      ) {
        await t.rollback();
        return res.status(400).json({
          error: 'This order is being handled by the seller\'s external dispatcher and has not yet arrived at its destination. It will become available once confirmed at the warehouse or pickup station.'
        });
      }

      const openTask = await DeliveryTask.findOne({
        where: {
          orderId,
          status: { [Op.in]: LOCKED_DELIVERY_TASK_STATUSES }
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (openTask) {
        const alreadyMine = openTask.deliveryAgentId === req.user.id;
        await t.rollback();
        return res.status(409).json({
          error: alreadyMine
            ? 'You have already requested or been assigned this order'
            : 'This order already has an active delivery request or assignment'
        });
      }

      const { PlatformConfig } = require('../models');
      const provisionalDeliveryType = getProvisionalDeliveryType(order);

      // Source of truth: order-level delivery fee.
      const deliveryFee = parseFloat(order.deliveryFee) || 0;

      // Fetch and lock the current agent share percentage at request time
      let agentShare = 70; // default
      try {
        const shareConfig = await PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' }, transaction: t });
        if (shareConfig) agentShare = parseFloat(shareConfig.value);
      } catch (_) { }

      // Create the request task with a provisional route type.
      // Admin can still override the exact route during approval/assignment.
      task = await DeliveryTask.create({
        orderId,
        deliveryAgentId: req.user.id,
        status: 'requested',
        deliveryType: provisionalDeliveryType,
        deliveryFee,
        agentShare
      }, { transaction: t });

      // Check for AUTO-APPROVE
      let shouldAutoApprove = false;
      try {
        const logisticConfig = await PlatformConfig.findOne({ where: { key: 'logistic_settings' }, transaction: t });
        if (logisticConfig) {
          const settings = typeof logisticConfig.value === 'string' ? JSON.parse(logisticConfig.value) : logisticConfig.value;
          if (settings.autoApproveRequests === true) {
            shouldAutoApprove = true;
          }
        }
      } catch (confErr) {
        console.error('Error checking auto-approve config:', confErr);
      }

      if (shouldAutoApprove) {
        // We need 'order' attached to 'task' for the helper to work fully (notifications etc)
        task.order = order; 
        await _approveDeliveryRequestInternal(task, { transaction: t });
      }

      await t.commit();
      
      if (shouldAutoApprove) {
        return res.json({ message: 'Request auto-approved and assigned!', task: { ...task.get({plain:true}), status: 'assigned' }, autoApproved: true });
      }
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    // Notify Admins (Only if NOT auto-approved)
    const { User } = require('../models');
    const admins = await User.findAll({ where: { role: ['admin', 'super_admin'] } });
    const { createNotification } = require('../utils/notificationHelpers');

    for (const admin of admins) {
      await createNotification(
        admin.id,
        'New Delivery Request 🙋‍♂️',
        `Agent ${req.user.name} has requested Order #${order.orderNumber}. check Delivery Assignments to approve.`,
        'info'
      );
    }

    const { getIO } = require('../realtime/socket');
    getIO().to('admin').emit('deliveryRequestUpdate', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      agentId: req.user.id,
      agentName: req.user.name,
      status: 'requested',
      taskId: task.id
    });

    res.json({ message: 'Request sent successfully', task });
  } catch (e) {
    console.error('Error in requestOrderAssignment:', e);
    res.status(500).json({ error: 'Failed to request assignment' });
  }
};

// GET /api/delivery/requests?status=requested
const listPendingRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    else where.status = 'requested'; // Default to requested

    const tasks = await DeliveryTask.findAll({
      where,
      include: [
        {
          model: Order,
          as: 'order',
          include: [
            { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessLandmark', 'businessPhone', 'phone', 'businessLat', 'businessLng', 'businessName'] },
            { model: User, as: 'user', attributes: ['id', 'name', 'phone', 'email', 'businessName'] },
            { model: OrderItem, as: 'OrderItems' },
            { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
            { model: Warehouse, as: 'DestinationWarehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
            { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
            { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
            { model: FastFoodPickupPoint, as: 'DestinationFastFoodPickupPoint', attributes: ['id', 'name', 'address', 'contactPhone'] }
          ]
        },
        {
          model: User,
          as: 'deliveryAgent',
          attributes: ['id', 'name', 'email', 'phone', 'businessName'],
          include: [{ model: DeliveryAgentProfile, as: 'deliveryProfile' }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(tasks);
  } catch (e) {
    console.error('Error in listPendingRequests:', e);
    res.status(500).json({ error: 'Failed to load requests' });
  }
};

// POST /api/delivery/requests/:taskId/approve (Admin Only)
const adminApproveRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { taskId } = req.params;
    const { deliveryType, deliveryFee, notes } = req.body;

    const task = await DeliveryTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!task) {
      await t.rollback();
      return res.status(404).json({ error: 'Request not found' });
    }

    if (['assigned', 'accepted', 'arrived_at_pickup', 'in_progress', 'completed'].includes(task.status)) {
      await t.commit();
      return res.json({
        message: 'Request already approved',
        task: task.get({ plain: true }),
        alreadyProcessed: true
      });
    }

    if (task.status !== 'requested') {
      await t.rollback();
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    await _approveDeliveryRequestInternal(task, { deliveryType, deliveryFee, notes, transaction: t });
    await t.commit();

    return res.json({
      message: 'Request approved successfully',
      task: {
        ...task.get({ plain: true }),
        status: 'assigned'
      }
    });
  } catch (e) {
    await t.rollback();
    console.error('Error in adminApproveRequest:', e);
    return res.status(500).json({ error: 'Failed to approve request' });
  }
};

// POST /api/delivery/requests/:taskId/reject (Admin Only)
const adminRejectRequest = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;

    const task = await DeliveryTask.findByPk(taskId);
    if (!task) return res.status(404).json({ error: 'Request not found' });
    if (task.status !== 'requested') return res.status(400).json({ error: 'Only pending requests can be rejected' });

    await task.update({
      status: 'rejected',
      rejectionReason: reason || 'Admin rejected request'
    });

    // Notify Agent
    const { createNotification } = require('../utils/notificationHelpers');
    if (task.deliveryAgentId) {
      // Wait, if it's 'requested', deliveryAgentId IS set (to the requester).
      await createNotification(
        task.deliveryAgentId,
        'Delivery Request Rejected',
        `Your request to deliver Order #${task.order?.orderNumber || 'Unknown'} was rejected. Reason: ${reason}`,
        'error'
      );

      const { getIO } = require('../realtime/socket');
      getIO().to(`user:${task.deliveryAgentId}`).emit('deliveryRequestUpdate', {
        orderId: task.orderId,
        status: 'rejected',
        taskId: task.id,
        rejectionReason: reason
      });
    }

    res.json({ message: 'Request rejected', task });
  } catch (e) {
    console.error('Error in adminRejectRequest:', e);
    res.status(500).json({ error: 'Failed to reject request' });
  }
};

/**
 * Admin: Bulk approve delivery requests.
 * Loops through IDs and processes assignments within a transaction.
 */
const adminBulkApproveRequests = async (req, res) => {
  try {
    const { taskIds, deliveryType, notes } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: 'No task IDs provided' });
    }

    // Find all 'requested' tasks in the provided list
    const tasks = await DeliveryTask.findAll({
      where: { 
        id: { [Op.in]: taskIds }, 
        status: 'requested' 
      },
      include: [{ model: Order, as: 'order' }]
    });

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'No valid pending requests found' });
    }

    const t = await sequelize.transaction();
    const results = [];
    const { createNotification, notifyDeliveryAgentAssignment } = require('../utils/notificationHelpers');
    const { getIO } = require('../realtime/socket');

    try {
      for (const task of tasks) {
        // 1. Update the task to assigned status
        await task.update({
          status: 'assigned',
          deliveryType: deliveryType || task.deliveryType,
          assignedAt: new Date(),
          agentNotes: notes || 'Bulk approved by admin'
        }, { transaction: t });

        // 2. Update the order with the agent assignment
        if (task.order) {
          await task.order.update({
            deliveryAgentId: task.deliveryAgentId,
            deliveryType: deliveryType || task.deliveryType
          }, { transaction: t });
        }

        results.push(task.id);
      }
      await t.commit();

      // Notifications (outside transaction to avoid delays/locking issues)
      for (const task of tasks) {
        if (task.deliveryAgentId && task.order) {
          // Internal Bell Notification
          await createNotification(
            task.deliveryAgentId,
            'Delivery Request Approved 🚚',
            `Your request for Order #${task.order.orderNumber} has been approved in bulk. Please check your assigned tasks.`,
            'success'
          );

          // Standardized Assignment Notifications (Email/SMS/WhatsApp based on settings)
          let assignedType = deliveryType || task.deliveryType;
          await notifyDeliveryAgentAssignment(task.deliveryAgentId, task.order, task.order.orderNumber, assignedType);

          // Real-time update
          getIO().to(`user:${task.deliveryAgentId}`).emit('deliveryRequestUpdate', {
            orderId: task.orderId,
            status: 'approved',
            taskId: task.id,
            deliveryType: assignedType
          });
        }
      }
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    res.json({ 
      success: true,
      message: `Successfully approved ${results.length} requests`, 
      approvedIds: results 
    });
  } catch (e) {
    console.error('Error in adminBulkApproveRequests:', e);
    res.status(500).json({ error: 'Failed to bulk approve requests' });
  }
};

/**
 * Admin: Bulk reject delivery requests.
 */
const adminBulkRejectRequests = async (req, res) => {
  try {
    const { taskIds, reason } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ error: 'No task IDs provided' });
    }

    const tasks = await DeliveryTask.findAll({
      where: { 
        id: { [Op.in]: taskIds }, 
        status: 'requested' 
      },
      include: [{ model: Order, as: 'order' }]
    });

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'No valid pending requests found' });
    }

    const t = await sequelize.transaction();
    const results = [];
    const { createNotification } = require('../utils/notificationHelpers');
    const { getIO } = require('../realtime/socket');

    try {
      for (const task of tasks) {
        await task.update({
          status: 'rejected',
          rejectionReason: reason || 'Bulk rejected by admin'
        }, { transaction: t });
        results.push(task.id);
      }
      await t.commit();

      // Notifications
      for (const task of tasks) {
        if (task.deliveryAgentId) {
          await createNotification(
            task.deliveryAgentId,
            'Delivery Request Rejected ❌',
            `Your request for Order #${task.order?.orderNumber || 'Unknown'} was rejected. Reason: ${reason || 'Bulk rejected'}`,
            'error'
          );
          
          getIO().to(`user:${task.deliveryAgentId}`).emit('deliveryRequestUpdate', {
            orderId: task.orderId,
            status: 'rejected',
            taskId: task.id,
            rejectionReason: reason
          });
        }
      }
    } catch (txErr) {
      await t.rollback();
      throw txErr;
    }

    res.json({ 
      success: true,
      message: `Successfully rejected ${results.length} requests`, 
      rejectedIds: results 
    });
  } catch (e) {
    console.error('Error in adminBulkRejectRequests:', e);
    res.status(500).json({ error: 'Failed to bulk reject requests' });
  }
};

// PATCH /api/delivery/tasks/:taskId/status
const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, agentNotes, proofOfDelivery, currentLocation } = req.body;

    const allowedStatuses = ['in_progress', 'completed', 'failed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const task = await DeliveryTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    // Enforcement: Agent must be ONLINE and Complete to update task status
    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile || !profile.isActive) {
      return res.status(403).json({ error: 'You must be ONLINE to manage tasks.' });
    }
    const { isComplete } = checkProfileCompleteness(profile, req.user);
    if (!isComplete) {
      return res.status(403).json({ error: 'Profile incomplete. Please update details to continue working.' });
    }

    const updates = { status };
    if (agentNotes) updates.agentNotes = agentNotes;
    if (proofOfDelivery) updates.proofOfDelivery = proofOfDelivery;
    if (currentLocation) updates.currentLocation = typeof currentLocation === 'string' ? currentLocation : JSON.stringify(currentLocation);

    if (status === 'completed' && (task.status === 'completed' || task.completedAt)) {
      return res.status(400).json({ error: 'This delivery task has already been settled.' });
    }

    if (status === 'in_progress' && !task.startedAt) {
      updates.startedAt = new Date();
    }
    // Calculate agent earnings if completing
    if (status === 'completed') {
      // Final customer delivery must be completed via handover code confirmation.
      if (['warehouse_to_customer', 'seller_to_customer'].includes(task.deliveryType)) {
        return res.status(400).json({
          error: 'Final delivery requires customer handover code confirmation. Ask customer to enter the delivery code.'
        });
      }

      try {
        await creditAgentForTask(task.id);
      } catch (err) {
        console.error('Error crediting agent in updateTaskStatus:', err);
        throw err;
      }
    }

    if (status === 'failed' && req.body.failureReason) {
      updates.failureReason = req.body.failureReason;
    }

    await task.update(updates);

    // Update order status
    if (task.order) {
      let orderStatus = task.order.status;

      if (status === 'completed') {
        const hubTypes = ['seller_to_warehouse', 'customer_to_warehouse'];
        const stationTypes = ['seller_to_pickup_station', 'warehouse_to_pickup_station'];
        const returnTypes = ['warehouse_to_seller'];

        if (hubTypes.includes(task.deliveryType)) {
          orderStatus = 'at_warehouse';
        } else if (stationTypes.includes(task.deliveryType)) {
          orderStatus = task.order.deliveryMethod === 'home_delivery' 
            ? 'at_pick_station' 
            : 'ready_for_pickup';
        } else if (returnTypes.includes(task.deliveryType)) {
          orderStatus = 'returned';
        } else {
          orderStatus = 'delivered';

          // MOVES SELLER & MARKETER TO SUCCESS
          const t = await sequelize.transaction();
          try {
            const { Commission } = require('../models');

            // 1. Seller move to success
            const sellerId = task.order.sellerId;
            if (sellerId) {
              // Get item total (order.total - deliveryFee)
              const sellerAmount = calculateSellerMerchandisePayout(task.order, task.order.OrderItems);
              await moveToSuccess(sellerId, sellerAmount, task.order.orderNumber, 'Sale Earning', task.orderId, t, 'seller');
            }

            // 2. Marketers move to success
            let totalCommission = 0;
            const commissions = await Commission.findAll({ where: { orderId: task.orderId }, transaction: t });
            for (const comm of commissions) {
              totalCommission += parseFloat(comm.commissionAmount);
              await moveToSuccess(comm.marketerId, comm.commissionAmount, task.order.orderNumber, 'Commission Earning', task.orderId, t, 'marketer');
              await comm.update({ status: 'success' }, { transaction: t });
            }

            // 3. Platform Item Sales Profit (Markup)
            const { PlatformWallet, PlatformTransaction, OrderItem, Product, FastFood, Service } = require('../models');
            const deliveredItems = await OrderItem.findAll({
              where: { orderId: task.orderId },
              include: [
                { model: Product, attributes: ['basePrice'] },
                { model: FastFood, attributes: ['basePrice'] },
                { model: Service, attributes: ['basePrice'] }
              ],
              transaction: t
            });

            let orderMarkup = 0;
            for (const item of deliveredItems) {
              const basePrice = parseFloat(item.Product?.basePrice || item.FastFood?.basePrice || item.Service?.basePrice || 0);
              const sellPrice = parseFloat(item.price || 0); // unit selling price
              const qty = parseInt(item.quantity || 1);
              orderMarkup += (sellPrice - basePrice) * qty;
            }

            const platformProfit = orderMarkup - totalCommission;

            if (platformProfit > 0) {
              const wallet = await PlatformWallet.findByPk(1, { transaction: t, lock: true });
              if (wallet) {
                wallet.balance = parseFloat(wallet.balance) + platformProfit;
                wallet.totalEarned = parseFloat(wallet.totalEarned) + platformProfit;
                await wallet.save({ transaction: t });

                await PlatformTransaction.create({
                  walletId: wallet.id,
                  amount: platformProfit,
                  type: 'credit',
                  sourceType: 'item_sale',
                  referenceId: task.order.id.toString(),
                  description: `Sales profit for Order #${task.order.orderNumber}`
                }, { transaction: t });
              }
            }

            await t.commit();
          } catch (err) {
            await t.rollback();
            console.error('Error moving seller/marketer to success:', err);
          }
        }
      } else if (status === 'in_progress') {
        const warehouseLegs = ['seller_to_warehouse', 'customer_to_warehouse', 'warehouse_to_seller'];
        const stationLegs = ['seller_to_pickup_station', 'warehouse_to_pickup_station'];
        if (warehouseLegs.includes(task.deliveryType)) {
          orderStatus = 'en_route_to_warehouse';
        } else if (stationLegs.includes(task.deliveryType)) {
          orderStatus = 'en_route_to_pick_station';
        } else {
          orderStatus = 'in_transit';
        }
      }

      const orderUpdates = {
        status: orderStatus,
        warehouseArrivalDate: (status === 'completed' && task.deliveryType === 'seller_to_warehouse') ? new Date() : task.order.warehouseArrivalDate,
        actualDelivery: (orderStatus === 'delivered') ? new Date() : task.order.actualDelivery
      };

      // When a leg completes at a hub (warehouse/pick station), reset the order's deliveryType to null.
      // This forces the admin to explicitly assign the NEXT leg type via the assignment modal.
      const hubLogistics = ['seller_to_warehouse', 'customer_to_warehouse', 'seller_to_pickup_station'];
      if (status === 'completed' && hubLogistics.includes(task.deliveryType)) {
        orderUpdates.deliveryType = null; // Clear — admin must assign the next leg explicitly
        orderUpdates.deliveryAgentId = null; // Unlink agent
      }

      // For terminal legs (final delivery to customer/pickup), just unlink the agent on completion
      const terminalTypes = ['warehouse_to_customer', 'seller_to_customer', 'warehouse_to_pickup_station'];
      if (status === 'completed' && terminalTypes.includes(task.deliveryType)) {
        orderUpdates.deliveryAgentId = null; // Unlink so it leaves active assignments view
      }

      await task.order.update(orderUpdates);

      await appendOrderTrackingUpdate(task.order, {
        status: orderStatus,
        message: `Delivery leg ${task.deliveryType || 'task'} moved to ${orderStatus.replace(/_/g, ' ')}.`,
        location: status === 'in_progress' ? task.pickupLocation : task.deliveryLocation,
        updatedBy: req.user?.id,
        updatedByRole: req.user?.role || 'delivery_agent'
      });

      // Trigger wallet credit if task is newly completed
      if (status === 'completed') {
        try {
          await creditAgentForTask(task.id);
        } catch (creditErr) {
          console.error(`[deliveryController] Failed to credit agent for task ${task.id}:`, creditErr.message);
        }
      }

      // Notify customer (Database Notification)
      await notifyCustomerDeliveryUpdate(task.order.userId, task.order.orderNumber, status, agentNotes);

      // Notify admins if reached warehouse
      if (status === 'completed' && task.deliveryType === 'seller_to_warehouse') {
        try {
          const { getIO } = require('../realtime/socket');
          const io = getIO();
          const { Notification } = require('../models');
          const admins = await User.findAll({ where: { role: ['admin', 'super_admin'] } });

          for (const admin of admins) {
            await Notification.create({
              userId: admin.id,
              title: '📦 Item Arrived at Warehouse',
              message: `Order #${task.order.orderNumber} has been delivered to the warehouse. Please process receipt.`,
              type: 'order_update'
            });

            if (io) {
              io.to(`user:${admin.id}`).emit('orderStatusUpdate', {
                orderId: task.order.id,
                orderNumber: task.order.orderNumber,
                status: 'at_warehouse',
                type: 'warehouse_arrival'
              });
            }
          }
        } catch (notifyErr) {
          console.warn('Failed to notify admins of warehouse arrival:', notifyErr);
        }
      }

      // NEW: Pickup Station Arrival Notification
      if (status === 'completed' && orderStatus === 'ready_for_pickup') {
        try {
          const stationId = task.order.pickupStationId;
          const station = stationId ? await PickupStation.findByPk(stationId) : null;
          if (station) {
            await notifyCustomerReadyForPickupStation(task.order, station);
          }
        } catch (err) {
          console.error('Error in station arrival notification:', err);
        }
      }

      // Real-time Socket.IO update for all interested parties
      try {
        const { getIO } = require('../realtime/socket');
        const io = getIO();
        if (io && task.order) {
          const payload = {
            orderId: task.order.id,
            status: orderStatus,
            orderNumber: task.order.orderNumber,
            warehouseArrivalDate: task.order.warehouseArrivalDate,
            actualDelivery: task.order.actualDelivery
          };
          io.to(`user:${task.order.userId}`).emit('orderStatusUpdate', payload);
          if (task.order.sellerId) io.to(`user:${task.order.sellerId}`).emit('orderStatusUpdate', payload);
          io.to('admin').emit('orderStatusUpdate', payload);
        }
      } catch (socketErr) {
        console.warn('Socket notification failed:', socketErr.message);
      }

    }

    return res.json({ message: 'Task status updated', task });
  } catch (e) {
    console.error('Error in updateTaskStatus:', e);
    res.status(500).json({ error: 'Failed to update task status' });
  }
};

// GET /api/delivery/tasks/:taskId
const getDeliveryTaskDetails = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await DeliveryTask.findByPk(taskId, {
      include: [
        {
          model: Order, as: 'order', include: [{
            model: OrderItem, as: 'OrderItems', 
          include: [
            { model: Product, attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images'], required: false },
            { model: FastFood, attributes: ['id', 'name', 'mainImage'], required: false },
            { model: Service, attributes: ['id', 'title'], required: false }
          ]
          }]
        },
        { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessName'] }
      ]
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const plainTask = task.get({ plain: true });
    if (plainTask?.order && (!Array.isArray(plainTask.order.OrderItems) || plainTask.order.OrderItems.length === 0)) {
      const recoveredItems = await OrderItem.findAll({
        where: { orderId: plainTask.order.id },
        include: orderItemIncludeConfig
      });

      if (recoveredItems.length > 0) {
        plainTask.order.OrderItems = recoveredItems.map((item) => item.get({ plain: true }));
      }
    }

    res.json(plainTask);
  } catch (e) {
    console.error('Error in getDeliveryTaskDetails:', e);
    res.status(500).json({ error: 'Failed to load task details' });
  }
};

// GET /api/delivery/stats
const getAgentStats = async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const agentId = req.user.id;

    // Determine date range
    const now = new Date();
    let startDate = new Date();

    if (period === 'daily') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'monthly') {
      startDate.setMonth(now.getMonth() - 1);
    } else {
      startDate = new Date(0); // All time
    }

    // Fetch Completed Tasks in Range
    const tasks = await DeliveryTask.findAll({
      where: {
        deliveryAgentId: agentId,
        status: 'completed',
        completedAt: {
          [Op.gte]: startDate
        }
      },
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['orderNumber', 'deliveryRating']
        }
      ],
      order: [['completedAt', 'DESC']]
    });

    // Fetch current wallet status for balance stats
    let wallet = await Wallet.findOne({ where: { userId: agentId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId: agentId, balance: 0, pendingBalance: 0, successBalance: 0 });
    }

    // Agent Share Config for fallback calculations
    const { PlatformConfig } = require('../models');
    const config = await PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' } });
    const shareRatio = (config ? parseFloat(config.value) : 70) / 100;

    // Helper to get effective earning (with fallback for legacy/missing data)
    // Uses the share LOCKED on the task at assignment time, not the current global config.
    const getEffectiveEarning = (task) => {
      const stored = parseFloat(task.agentEarnings);
      const fee = parseFloat(task.deliveryFee) || 0;
      // If stored earnings are missing or equal the raw fee (incorrectly saved), recalculate
      if (!stored || stored === fee) {
        // Use the locked rate from the task itself; fall back to current global rate if missing (legacy tasks)
        const lockedShare = parseFloat(task.agentShare) || (config ? parseFloat(config.value) : 70);
        return fee * (lockedShare / 100);
      }
      return stored;
    };


    // Calculate Stats for Period
    const totalEarnings = tasks.reduce((sum, t) => sum + getEffectiveEarning(t), 0);
    const completedDeliveries = tasks.length;
    const totalTips = 0;

    // Recent Transactions
    const recentTransactions = tasks.slice(0, 10).map(t => ({
      id: t.id,
      type: 'earning',
      amount: getEffectiveEarning(t),
      date: t.completedAt ? new Date(t.completedAt).toLocaleDateString() : 'N/A',
      status: 'completed',
      description: `Order #${t.order?.orderNumber || 'Unknown'}`
    }));


    // Chart Data Generation
    let chartLabels = [];
    let chartValues = [];

    if (period === 'daily') {
      const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
      chartLabels = hours;
      chartValues = new Array(6).fill(0);

      tasks.forEach(task => {
        const hour = new Date(task.completedAt).getHours();
        const index = Math.floor(hour / 4);
        if (index < 6) chartValues[index] += getEffectiveEarning(task);
      });

    } else if (period === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      chartLabels = [];
      chartValues = [];
      const dailyEarnings = {};

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dayName = days[d.getDay()];
        const dayKey = d.toDateString();
        chartLabels.push(dayName);
        dailyEarnings[dayKey] = 0;
      }

      tasks.forEach(t => {
        const dayKey = new Date(t.completedAt).toDateString();
        if (dailyEarnings[dayKey] !== undefined) {
          dailyEarnings[dayKey] += getEffectiveEarning(t);
        }
      });


      chartValues = chartLabels.map((_, i) => {
        const d = new Date();
        d.setDate(now.getDate() - (6 - i));
        return dailyEarnings[d.toDateString()] || 0;
      });

    } else {
      chartLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
      chartValues = [0, 0, 0, 0];
      tasks.forEach(t => {
        const d = new Date(t.completedAt).getDate();
        const weekIndex = Math.min(Math.floor((d - 1) / 7), 3);
        chartValues[weekIndex] += getEffectiveEarning(t);
      });

    }

    res.json({
      totalEarnings,
      pendingPayout: wallet.balance + wallet.successBalance,
      availableBalance: wallet.balance,
      successBalance: wallet.successBalance,
      pendingBalance: wallet.pendingBalance,
      completedDeliveries,
      totalTips,
      recentTransactions,
      chartData: {
        labels: chartLabels,
        datasets: [{
          label: 'Earnings (KES)',
          data: chartValues,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.3,
          fill: true
        }]
      }
    });

  } catch (e) {
    console.error('Error in getAgentStats:', e);
    res.status(500).json({ error: 'Failed to load stats' });
  }
};


// Admin: list delivery agents with profile and active assignment counts
const adminListDeliveryAgents = async (req, res) => {
  try {
    const { vehicleType, location, isActive, minRating } = req.query;
    const where = { role: 'delivery_agent' };

    const profileWhere = {};
    if (vehicleType) profileWhere.vehicleType = vehicleType;
    if (location) profileWhere.location = { [Op.like]: `%${location}%` };
    if (isActive !== undefined) profileWhere.isActive = isActive === 'true';
    if (minRating) profileWhere.rating = { [Op.gte]: parseFloat(minRating) };

    const agents = await User.findAll({
      where,
      attributes: [
        'id', 'name', 'email', 'phone', 'role', 'isDeliverySuspended', 'isDeactivated',
        [
          sequelize.literal(`(
            SELECT COUNT(*)
            FROM "Order" AS o
            WHERE o.deliveryAgentId = "User".id
            AND o.status NOT IN ('delivered', 'cancelled')
          )`),
          'activeAssignments'
        ],
        [
          sequelize.literal(`(
            SELECT COUNT(*)
            FROM DeliveryTask AS t
            WHERE t.deliveryAgentId = "User".id
            AND t.status IN ('assigned', 'accepted', 'in_progress')
          )`),
          'activeTasks'
        ]
      ],
      include: [{
        model: DeliveryAgentProfile,
        as: 'deliveryProfile',
        where: Object.keys(profileWhere).length > 0 ? profileWhere : undefined,
        required: Object.keys(profileWhere).length > 0
      }],
    });

    const data = agents.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      phone: a.phone,
      role: a.role,
      isDeliverySuspended: a.isDeliverySuspended,
      isDeactivated: a.isDeactivated,
      deliveryProfile: a.deliveryProfile || null,
      activeAssignments: parseInt(a.getDataValue('activeAssignments') || '0', 10),
      activeTasks: parseInt(a.getDataValue('activeTasks') || '0', 10),
    }));
    res.json(data);
  } catch (e) {
    console.error('Error in adminListDeliveryAgents:', e);
    res.status(500).json({ error: 'Failed to list delivery agents' });
  }
};

// Admin: Get available agents for a specific order
const getAvailableAgentsForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'seller' },
        { model: Warehouse, as: 'Warehouse' },
        { model: models.PickupStation, as: 'PickupStation' },
        { model: Warehouse, as: 'DestinationWarehouse' },
        { model: models.PickupStation, as: 'DestinationPickStation' }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const agents = await User.findAll({
      where: { role: 'delivery_agent' },
      include: [{ model: DeliveryAgentProfile, as: 'deliveryProfile' }]
    });

    const { calculateDistance, parseLocation } = require('../utils/deliveryUtils');

    // Get order-related coordinates (Prioritize admin routing for warehouse/pickup station)
    const sellerLat = order.seller?.businessLat;
    const sellerLng = order.seller?.businessLng;
    const customerLat = order.deliveryLat;
    const customerLng = order.deliveryLng;

    // Use admin-set destination if available, otherwise fallback to seller choice or house choice
    const targetWarehouse = order.DestinationWarehouse || order.Warehouse;
    const targetPickStation = order.DestinationPickStation || order.PickupStation;

    const warehouseLat = targetWarehouse?.lat || targetPickStation?.lat;
    const warehouseLng = targetWarehouse?.lng || targetPickStation?.lng;

    const matches = agents.map(agent => {
      const profile = agent.deliveryProfile;
      const agentLocation = profile ? parseLocation(profile.currentLocation) : null;
      const agentLat = agentLocation ? agentLocation.lat : null;
      const agentLng = agentLocation ? agentLocation.lng : null;

      const distances = {
        agentToSeller: (agentLat && agentLng && sellerLat && sellerLng) ? calculateDistance(agentLat, agentLng, sellerLat, sellerLng) : null,
        agentToCustomer: (agentLat && agentLng && customerLat && customerLng) ? calculateDistance(agentLat, agentLng, customerLat, customerLng) : null,
        agentToWarehouse: (agentLat && agentLng && warehouseLat && warehouseLng) ? calculateDistance(agentLat, agentLng, warehouseLat, warehouseLng) : null,
        sellerToCustomer: (sellerLat && sellerLng && customerLat && customerLng) ? calculateDistance(sellerLat, sellerLng, customerLat, customerLng) : null,
        sellerToWarehouse: (sellerLat && sellerLng && warehouseLat && warehouseLng) ? calculateDistance(sellerLat, sellerLng, warehouseLat, warehouseLng) : null
      };

      const { isComplete, missing } = checkProfileCompleteness(profile, agent);
      const isAvailable = profile ? isAgentAvailableNow(profile) : false;

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          phone: agent.phone,
          profile: profile,
          isActive: profile?.isActive || false,
          isAvailable: isAvailable,
          isComplete: isComplete,
          missingFields: missing
        },
        distances
      };
    });

    // For pick station orders, find the station details for better suggestions
    let pickStationData = null;
    if (order.deliveryMethod === 'pick_station' && order.pickStation) {
      try {
        const { PickupStation } = require('../models');
        const { Op } = require('sequelize');
        const pickStationName = order.pickStation;

        pickStationData = await PickupStation.findOne({
          where: {
            [Op.or]: [
              { name: pickStationName },
              sequelize.where(sequelize.literal(`'${pickStationName.replace(/'/g, "''")}'`), Op.like, sequelize.fn('concat', sequelize.col('name'), '%'))
            ]
          }
        });
      } catch (err) {
        console.warn('⚠️ Failed to fetch pickup station node for suggestions:', err.message);
      }
    }

    res.json({
      agents: matches,
      suggestions: {
        sellerAddress: order.seller?.businessAddress || 'Seller location not set',
        sellerLandmark: order.seller?.businessLandmark || null,
        sellerPhone: order.seller?.businessPhone || order.seller?.phone || null,
        warehouseAddress: targetWarehouse?.address || targetPickStation?.location || 'Warehouse location not set',
        warehouseLandmark: targetWarehouse?.landmark || targetPickStation?.landmark || null,
        warehousePhone: targetWarehouse?.contactPhone || targetPickStation?.phone || null,
        customerAddress: order.deliveryAddress || 'Customer address not set',
        customerPhone: order.customerPhone || order.user?.phone || null,
        customerName: order.customerName || order.user?.name || null,
        pickStationAddress: targetPickStation?.location || pickStationData?.location || null,
        pickStationFee: targetPickStation?.price || pickStationData?.price || null,
        pickStationId: order.destinationPickStationId || order.pickupStationId || null,
        warehouseId: order.destinationWarehouseId || order.warehouseId || null
      }
    });
  } catch (e) {
    console.error('Error in getAvailableAgentsForOrder:', e);
    res.status(500).json({ error: 'Failed to find available agents and calculate distances', details: e.message });
  }
};

// POST /api/orders/:orderId/rate-delivery
const rateDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, review } = req.body;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Find order and verify it belongs to user
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: 'deliveryAgent' }]
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ error: 'Can only rate delivered orders' });
    }

    if (order.deliveryRating) {
      return res.status(400).json({ error: 'Order already rated' });
    }

    if (!order.deliveryAgentId) {
      return res.status(400).json({ error: 'No delivery agent assigned' });
    }

    // Update order rating
    await order.update({
      deliveryRating: rating,
      deliveryReview: review || null,
      deliveryRatedAt: new Date()
    });

    // Update delivery agent profile rating
    await updateAgentRating(order.deliveryAgentId);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      rating
    });
  } catch (error) {
    console.error('Error rating delivery:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
};

// Helper: Calculate and update agent average rating
const updateAgentRating = async (agentId) => {
  try {
    const orders = await Order.findAll({
      where: {
        deliveryAgentId: agentId,
        deliveryRating: { [Op.not]: null }
      }
    });

    if (orders.length === 0) return;

    const avgRating = orders.reduce((sum, o) => sum + o.deliveryRating, 0) / orders.length;

    const profile = await DeliveryAgentProfile.findOne({
      where: { userId: agentId }
    });

    if (profile) {
      await profile.update({
        rating: Math.round(avgRating * 10) / 10 // Round to 1 decimal
      });
    }
  } catch (error) {
    console.error('Error updating agent rating:', error);
  }
};

// POST /api/delivery/tasks/:taskId/confirm-collection
const confirmCollection = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { notes, location } = req.body;

    const task = await DeliveryTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }]
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    // Only allow collection confirmation if task status is arrived_at_pickup
    if (task.status !== 'arrived_at_pickup') {
      return res.status(400).json({ error: 'Task must be marked as "arrived_at_pickup" before collection can be confirmed' });
    }

    const now = new Date();

    // Determine the appropriate order status based on delivery type
    const deliveryType = task.deliveryType || task.order?.deliveryType;

    let newOrderStatus;
    switch (deliveryType) {
      case 'warehouse_to_customer':
      case 'seller_to_customer':
        newOrderStatus = 'in_transit';
        break;
      case 'seller_to_warehouse':
      case 'customer_to_warehouse':
      case 'warehouse_to_seller':
        newOrderStatus = 'en_route_to_warehouse';
        break;
      case 'seller_to_pickup_station':
      case 'warehouse_to_pickup_station':
        newOrderStatus = 'en_route_to_pick_station';
        break;
      default:
        newOrderStatus = 'in_transit';
    }

    // Update delivery task
    await task.update({
      status: 'in_progress',
      collectedAt: now,
      startedAt: task.startedAt || now,
      agentNotes: notes ? (task.agentNotes ? `${task.agentNotes}\nCollection: ${notes}` : `Collection: ${notes}`) : task.agentNotes,
      currentLocation: location ? (typeof location === 'string' ? location : JSON.stringify(location)) : task.currentLocation
    });

    // Update order
    if (task.order) {
      await task.order.update({
        status: newOrderStatus,
        pickedUpAt: now
      });

      await appendOrderTrackingUpdate(task.order, {
        status: newOrderStatus,
        message: `Collection confirmed for ${deliveryType || 'delivery leg'}: now ${newOrderStatus.replace(/_/g, ' ')}.`,
        location: task.deliveryLocation || null,
        updatedBy: req.user?.id,
        updatedByRole: req.user?.role || 'delivery_agent'
      });

      // Notify customer
      await notifyCustomerDeliveryUpdate(
        task.order.userId,
        task.order.orderNumber,
        'collected',
        `Your order has been collected and is ${newOrderStatus === 'in_transit' ? 'in transit' : 'in transit to warehouse'}.`
      );

      // Notify parties via Socket.IO
      try {
        const { getIO } = require('../realtime/socket');
        const io = getIO();
        if (io) {
          const payload = {
            orderId: task.order.id,
            status: newOrderStatus,
            orderNumber: task.order.orderNumber,
            pickedUpAt: now
          };
          io.to(`user:${task.order.userId}`).emit('orderStatusUpdate', payload);
          if (task.order.sellerId) io.to(`user:${task.order.sellerId}`).emit('orderStatusUpdate', payload);
          io.to('admin').emit('orderStatusUpdate', payload);
        }
      } catch (socketErr) {
        console.warn('Socket notification failed in confirmCollection:', socketErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Collection confirmed successfully',
      task,
      orderStatus: newOrderStatus
    });
  } catch (e) {
    console.error('Error in confirmCollection:', e);
    res.status(500).json({ error: 'Failed to confirm collection' });
  }
};

const markArrivedAtPickup = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await DeliveryTask.findByPk(taskId, { include: [{ model: Order, as: 'order' }] });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    if (task.status !== 'accepted') {
      return res.status(400).json({ error: 'Can only mark arrival for accepted tasks' });
    }

    await task.update({
      status: 'arrived_at_pickup',
      arrivedAt: new Date()
    });

    // Real-time update for seller and admin
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      if (task.order && task.order.sellerId) {
        io.to(`user:${task.order.sellerId}`).emit('orderUpdate', { orderId: task.order.id, event: 'agent_arrived' });
      }
      io.to('admin').emit('orderUpdate', { orderId: task.order.id, event: 'agent_arrived', task });
    }

    res.json({ success: true, message: 'Arrival confirmed', task });
  } catch (error) {
    console.error('Error in markArrivedAtPickup:', error);
    res.status(500).json({
      error: 'Failed to mark arrival (DEBUG-500-V1)',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Agent marks arrival at Customer location
 * POST /api/delivery/tasks/:taskId/mark-arrived-customer
 */
const markArrivedAtCustomer = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await DeliveryTask.findByPk(taskId, { 
      include: [
        { model: Order, as: 'order', include: [{ model: User, as: 'user' }] } 
      ] 
    });

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deliveryAgentId !== req.user.id) {
      return res.status(403).json({ error: 'This task is not assigned to you' });
    }

    // Must be in progress or in_transit to mark arrival at customer
    if (!['in_progress', 'accepted'].includes(task.status)) {
       return res.status(400).json({ error: 'Task must be in progress to mark arrival at customer' });
    }

    await task.update({
      status: 'arrived_at_customer',
      arrivedAtCustomerAt: new Date()
    });

    // Notify customer via WhatsApp
    if (task.order) {
      await notifyCustomerAgentArrived(task.order, req.user);
    }

    // Real-time update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io && task.order) {
      io.to(`user:${task.order.userId}`).emit('agentArrived', { 
        orderId: task.order.id, 
        orderNumber: task.order.orderNumber 
      });
      io.to('admin').emit('agentArrived', { 
        orderId: task.order.id, 
        agentName: req.user.name 
      });
    }

    res.json({ success: true, message: 'Customer notified of your arrival', task });
  } catch (error) {
    console.error('Error in markArrivedAtCustomer:', error);
    res.status(500).json({ error: 'Failed to notify arrival' });
  }
};

const updateMyCurrentLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and Longitude are required' });
    }

    const profile = await DeliveryAgentProfile.findOne({ where: { userId: req.user.id } });
    if (!profile) {
      return res.status(404).json({ error: 'Delivery profile not found' });
    }

    const locationData = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      timestamp: new Date().toISOString()
    };

    profile.currentLocation = JSON.stringify(locationData);
    await profile.save();

    res.json({ message: 'Location updated', currentLocation: locationData });
  } catch (error) {
    console.error('Error in updateMyCurrentLocation:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

const adminGetGlobalMapData = async (req, res) => {
  try {
    // 1. Fetch Online Agents
    const agents = await DeliveryAgentProfile.findAll({
      where: { isActive: true },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'phone', 'businessName']
      }]
    });

    const parsedAgents = agents.map(a => ({
      id: a.userId,
      name: a.user?.name,
      phone: a.user?.phone,
      vehicleType: a.vehicleType,
      location: a.currentLocation ? JSON.parse(a.currentLocation) : null
    })).filter(a => a.location);

    // 2. Fetch Active Jobs/Orders (Available for assignment or In progress)
    const activeOrders = await Order.findAll({
      where: {
        status: {
          [Op.in]: ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'at_warehouse', 'ready_for_pickup', 'in_transit']
        }
      },
      include: [
        { model: User, as: 'seller', attributes: ['id', 'name', 'businessLat', 'businessLng', 'businessAddress', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'lat', 'lng', 'address'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'lat', 'lng', 'location'] }
      ]
    });

    const parsedOrders = activeOrders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      deliveryType: o.deliveryType,
      origin: {
        lat: parseFloat(o.seller?.businessLat || o.Warehouse?.lat || 0),
        lng: parseFloat(o.seller?.businessLng || o.Warehouse?.lng || 0),
        name: o.seller?.name || o.Warehouse?.name || 'Origin'
      },
      destination: {
        lat: parseFloat(o.deliveryLat || (o.PickupStation?.lat || 0)),
        lng: parseFloat(o.deliveryLng || (o.PickupStation?.lng || 0)),
        name: o.customerName || o.PickupStation?.name || o.addressDetails || 'Destination'
      }
    })).filter(o => (o.origin.lat && o.origin.lng) || (o.destination.lat && o.destination.lng));

    // 3. Fetch Infrastructure POIs
    const warehouses = await Warehouse.findAll({ where: { isActive: true }, attributes: ['id', 'name', 'lat', 'lng', 'address'] });
    const pickupStations = await PickupStation.findAll({ where: { isActive: true }, attributes: ['id', 'name', 'lat', 'lng', 'location'] });

    res.json({
      success: true,
      data: {
        agents: parsedAgents,
        orders: parsedOrders,
        pois: {
          warehouses: warehouses.filter(w => w.lat && w.lng),
          pickupStations: pickupStations.filter(s => s.lat && s.lng)
        }
      }
    });

  } catch (error) {
    console.error('Error in adminGetGlobalMapData:', error);
    res.status(500).json({ error: 'Failed to fetch global map data' });
  }
};



// =====================
// Admin: Per-Agent Detail, History, Toggle Status
// =====================

const getAdminAgentDetail = async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = await User.findOne({
      where: { id: agentId },
      attributes: ['id', 'name', 'email', 'phone', 'createdAt', 'isDeactivated'],
      include: [{
        model: DeliveryAgentProfile,
        as: 'deliveryProfile',
        required: false
      }]
    });

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // All-time task stats
    const allTasks = await DeliveryTask.findAll({
      where: { deliveryAgentId: agentId },
      attributes: ['id', 'status', 'agentEarnings', 'deliveryFee', 'agentShare', 'completedAt', 'deliveryType', 'createdAt']
    });

    const completed = allTasks.filter(t => t.status === 'completed');
    const failed = allTasks.filter(t => t.status === 'failed');
    const totalEarnings = completed.reduce((sum, t) => {
      const stored = parseFloat(t.agentEarnings);
      const fee = parseFloat(t.deliveryFee) || 0;
      const share = parseFloat(t.agentShare) || 70;
      return sum + (stored && stored !== fee ? stored : fee * (share / 100));
    }, 0);

    // Wallet balance
    let wallet = null;
    try {
      wallet = await Wallet.findOne({ where: { userId: agentId } });
    } catch (_) {}

    res.json({
      agent: agent.toJSON(),
      stats: {
        totalTasks: allTasks.length,
        completedTasks: completed.length,
        failedTasks: failed.length,
        completionRate: allTasks.length > 0
          ? ((completed.length / allTasks.length) * 100).toFixed(1)
          : '0.0',
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        walletBalance: wallet ? parseFloat(wallet.balance || 0) : null,
        pendingBalance: wallet ? parseFloat(wallet.pendingBalance || 0) : null,
        successBalance: wallet ? parseFloat(wallet.successBalance || 0) : null
      }
    });
  } catch (e) {
    console.error('Error in getAdminAgentDetail:', e);
    res.status(500).json({ error: 'Failed to load agent details' });
  }
};

const getAdminAgentHistory = async (req, res) => {
  try {
    const { agentId } = req.params;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(50, parseInt(req.query.pageSize || '20', 10));

    const { count, rows } = await DeliveryTask.findAndCountAll({
      where: { deliveryAgentId: agentId },
      include: [{
        model: Order,
        as: 'order',
        attributes: ['id', 'orderNumber', 'status', 'total', 'deliveryMethod', 'deliveryAddress', 'deliveryRating'],
        required: false
      }],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const tasks = rows.map(t => {
      const stored = parseFloat(t.agentEarnings);
      const fee = parseFloat(t.deliveryFee) || 0;
      const share = parseFloat(t.agentShare) || 70;
      const earning = stored && stored !== fee ? stored : fee * (share / 100);
      return {
        id: t.id,
        status: t.status,
        deliveryType: t.deliveryType,
        deliveryFee: fee,
        agentEarnings: parseFloat(earning.toFixed(2)),
        agentShare: share,
        rejectionReason: t.rejectionReason,
        assignedAt: t.assignedAt,
        acceptedAt: t.acceptedAt,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
        order: t.order ? {
          id: t.order.id,
          orderNumber: t.order.orderNumber,
          status: t.order.status,
          total: t.order.total,
          deliveryMethod: t.order.deliveryMethod,
          deliveryAddress: t.order.deliveryAddress,
          rating: t.order.deliveryRating
        } : null
      };
    });

    res.json({
      tasks,
      meta: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) }
    });
  } catch (e) {
    console.error('Error in getAdminAgentHistory:', e);
    res.status(500).json({ error: 'Failed to load agent history' });
  }
};

const toggleAgentActiveStatus = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const profile = await DeliveryAgentProfile.findOne({ where: { userId: agentId } });
    if (!profile) return res.status(404).json({ error: 'Agent profile not found' });

    await profile.update({ isActive });

    res.json({
      success: true,
      message: `Agent ${isActive ? 'activated' : 'deactivated'} successfully`,
      isActive
    });
  } catch (e) {
    console.error('Error in toggleAgentActiveStatus:', e);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
};

module.exports = {
  listMyAssignedOrders,
  getMyProfile,
  upsertMyProfile,
  updateMyOrderStatus,
  acceptDeliveryTask,
  rejectDeliveryTask,
  updateTaskStatus,
  getDeliveryTaskDetails,
  getAgentStats,
  listAvailableOrders,
  requestOrderAssignment,
  adminListDeliveryAgents,
  getAvailableAgentsForOrder,
  rateDelivery,
  listPendingRequests,
  adminApproveRequest,
  adminRejectRequest,
  adminBulkApproveRequests,
  adminBulkRejectRequests,
  confirmCollection,
  markArrivedAtPickup,
  markArrivedAtCustomer,
  updateMyCurrentLocation,
  adminGetGlobalMapData,
  getAdminAgentDetail,
  getAdminAgentHistory,
  toggleAgentActiveStatus
};
