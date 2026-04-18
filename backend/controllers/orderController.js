const { sequelize } = require('../database/database');
const { Product, User, Wallet, Transaction, Order, OrderItem, Commission, DeliveryAgentProfile, Cart, FastFood, Service, DeliveryTask, DeliveryCharge, Warehouse, PickupStation, FastFoodPickupPoint, PlatformConfig, Notification, HandoverCode, Batch, Payment } = require('../models');

const { calculateCommission: createCommissionRecords } = require('./commissionController');
const { isValidTransition, getValidTransitionsForOrder, autoCreateDeliveryTask } = require('./orderTransitionController');
const { calculateItemCommission } = require('../utils/commissionUtils');
const { sendEmail } = require('../utils/mailer');
const { sendSms } = require('../utils/sms');
const { 
  notifyCustomerReadyForPickupStation,
  notifyCustomerSellerConfirmed,
  notifyCustomerOrderCancelled,
  notifyCustomerOrderPlaced,
  logNotify
} = require('../utils/notificationHelpers');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { creditPending, revertPending } = require('../utils/walletHelpers');
const { checkProfileCompleteness } = require('../utils/deliveryUtils');
const { upsertDeliveryChargeForTask, invoiceSellerChargeImmediately } = require('../utils/deliveryChargeHelpers');

const currentShare = 70; // 70% share for agent
const currentRate = 30; // 30% rate for platform
const FOOD_ORDER_CANCEL_WINDOW_MINUTES = 10;
const PRODUCT_ORDER_CANCEL_WINDOW_HOURS = 24;

const parseMaybeJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
};

const resolveVariantDetails = (product, type, variantId, comboId) => {
  const result = { variantName: null, comboName: null, variantPrice: null };
  if (!product) return result;

  if (variantId) {
    let variants = [];
    if (type === 'fastfood') {
      variants = parseMaybeJson(product.sizeVariants, []);
    } else {
      const direct = parseMaybeJson(product.variants, []);
      const tags = parseMaybeJson(product.tags, {});
      const tagVariants = parseMaybeJson(tags?.variants, []);
      variants = (Array.isArray(direct) && direct.length > 0) ? direct : (Array.isArray(tagVariants) ? tagVariants : []);
    }

    const target = String(variantId).toLowerCase();
    const matched = Array.isArray(variants)
      ? variants.find((v) => {
          if (!v || typeof v !== 'object') return false;
          const candidates = [v.id, v.name, v.size, v.sku].filter(Boolean).map((x) => String(x).toLowerCase());
          return candidates.includes(target);
        })
      : null;

    if (matched) {
      result.variantName = matched.name || matched.size || matched.sku || variantId;
      result.variantPrice = Number(matched.discountPrice || matched.displayPrice || matched.basePrice || 0) || null;
    } else {
      result.variantName = variantId;
    }
  }

  if (type === 'fastfood' && comboId) {
    const combos = parseMaybeJson(product.comboOptions, []);
    const target = String(comboId).toLowerCase();
    const matchedCombo = Array.isArray(combos)
      ? combos.find((c) => c && [c.id, c.name].filter(Boolean).map((x) => String(x).toLowerCase()).includes(target))
      : null;
    result.comboName = matchedCombo?.name || comboId;
  }

  return result;
};

// Administrative Action Synchronization (Locking)
const checkOrderActionLock = async (orderId, userId) => {
  const order = await Order.findByPk(orderId);
  if (!order) return { locked: false };

  // If locked by someone else and not expired (2 minute timeout)
  if (order.processingBy && order.processingBy !== userId && order.processingTimeout > new Date()) {
    const locker = await User.findByPk(order.processingBy);
    return {
      locked: true,
      message: `Order is currently being ${order.processingAction || 'processed'} by ${locker?.name || 'another admin'}.`,
      lockerId: order.processingBy,
      action: order.processingAction
    };
  }
  return { locked: false };
};

const acquireOrderActionLock = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action } = req.body; // e.g., 'assigning', 'cancelling', 'confirming'
    const userId = req.user.id;

    const lockStatus = await checkOrderActionLock(orderId, userId);
    if (lockStatus.locked) {
      return res.status(409).json({
        success: false,
        message: lockStatus.message,
        lockerId: lockStatus.lockerId,
        action: lockStatus.action
      });
    }

    // Acquire lock (2 minute expiry)
    const timeout = new Date(Date.now() + 2 * 60 * 1000);
    await Order.update({
      processingBy: userId,
      processingAction: action || 'processing',
      processingTimeout: timeout
    }, { where: { id: orderId } });

    res.json({ success: true, message: 'Lock acquired', timeout });
  } catch (error) {
    console.error('Error in acquireOrderActionLock:', error);
    res.status(500).json({ success: false, error: 'Failed to acquire lock' });
  }
};

const releaseOrderActionLock = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Only allow clearing if it's yours OR if it's already expired (though expiry is handled by check)
    await Order.update({
      processingBy: null,
      processingAction: null,
      processingTimeout: null
    }, {
      where: {
        id: orderId,
        [Op.or]: [
          { processingBy: userId },
          { processingTimeout: { [Op.lt]: new Date() } }
        ]
      }
    });

    res.json({ success: true, message: 'Lock released' });
  } catch (error) {
    console.error('Error in releaseOrderActionLock:', error);
    res.status(500).json({ success: false, error: 'Failed to release lock' });
  }
};

// Helper to cleanup expired assignments (e.g. 30 mins timeout)
const cleanupExpiredAssignments = async () => {
  const TIMEOUT_MINUTES = 30;
  const expirationTime = new Date(Date.now() - (TIMEOUT_MINUTES * 60 * 1000));

  try {
    const expiredTasks = await DeliveryTask.findAll({
      where: {
        status: 'assigned',
        assignedAt: { [Op.lt]: expirationTime }
      }
    });

    if (expiredTasks.length > 0) {
      console.log(`[Lifecycle] Cleaning up ${expiredTasks.length} expired delivery assignments`);
      for (const task of expiredTasks) {
        const order = await Order.findByPk(task.orderId);
        if (order) {
          // Revert status: if it was seller_confirmed, go back to order_placed. 
          // If it was at_warehouse, it stays at_warehouse but unassigned.
          let revertStatus = order.status;
          if (order.status === 'seller_confirmed') {
            revertStatus = 'order_placed';
          }
          await order.update({ deliveryAgentId: null, status: revertStatus });
          console.log(`[Lifecycle] Expired task ${task.id}: Order #${order.orderNumber} unassigned.`);
        }
        await task.update({ status: 'failed', notes: 'Assignment expired due to agent inactivity' });
      }
    }
  } catch (error) {
    console.error('Error cleaning up expired assignments:', error);
  }
};

// Run cleanup every 10 minutes in the background (not on every request)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    cleanupExpiredAssignments().catch(e => console.error('Background cleanup error:', e));
  }, 10 * 60 * 1000);
}

const gen = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 999)}`;
const calculateCommissionAmount = (total, referralCode) => referralCode ? total * 0.1 : 0;

// Allowed statuses and transitions
const ALLOWED_STATUSES = ['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'en_route_to_pick_station', 'at_pick_station', 'awaiting_delivery_assignment', 'ready_for_pickup', 'in_transit', 'delivered', 'completed', 'failed', 'cancelled', 'returned'];

const notifyLifecycleStatusChange = async (orderId, status) => {
  if (!['ready_for_pickup', 'in_transit'].includes(status)) {
    return;
  }

  try {
    const order = await Order.findByPk(orderId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone', 'businessPhone', 'businessName'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone'] },
        { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location', 'contactPhone'] },
        { model: FastFoodPickupPoint, as: 'DestinationFastFoodPickupPoint', attributes: ['id', 'name', 'address', 'contactPhone'] }
      ]
    });

    if (!order || !order.user) {
      return;
    }

    const customer = order.user;
    const { getIO } = require('../realtime/socket');
    const io = getIO();

    if (status === 'ready_for_pickup') {
      const pickupDestination = order.DestinationFastFoodPickupPoint || order.DestinationPickStation || order.PickupStation;
      if (!pickupDestination) {
        return;
      }

      const pickupLocation = pickupDestination.location || pickupDestination.address || 'Pickup point';
      const pickupPhone = pickupDestination.contactPhone || 'N/A';
      const title = 'Order Ready for Pickup';
      const message = `Your order #${order.orderNumber} is ready for collection at ${pickupDestination.name}. Location: ${pickupLocation}. Contact: ${pickupPhone}.`;

      await Notification.create({
        userId: customer.id,
        title,
        message,
        type: 'success',
        read: false,
      });

      if (customer.email) {
        await sendEmail(customer.email, title, message);
      }
      if (customer.phone) {
        await sendSms(customer.phone, message);
        // WhatsApp Notification
        await notifyCustomerReadyForPickupStation(order, pickupDestination);
      }
      if (io) {
        io.to(`user:${customer.id}`).emit('orderLifecycleNotification', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status,
          title,
          message,
        });
      }
    }

    if (status === 'in_transit') {
      const driverPhone = order.deliveryAgent?.phone || order.deliveryAgent?.businessPhone || 'N/A';
      const driverName = order.deliveryAgent?.name || 'our delivery agent';
      const paymentNote = order.paymentConfirmed
        ? 'Your order is fully paid.'
        : `Prepare KES ${order.total || 0} for payment on delivery.`;
      const title = 'Order In Transit';
      const message = `Your order #${order.orderNumber} is now in transit with ${driverName}. Driver contact: ${driverPhone}. ${paymentNote}`;

      await Notification.create({
        userId: customer.id,
        title,
        message,
        type: 'info',
        read: false,
      });

      if (customer.email) {
        await sendEmail(customer.email, title, message);
      }
      if (customer.phone) {
        await sendSms(customer.phone, message);
        // WhatsApp Notification
        await notifyCustomerOutForDelivery(order, order.deliveryAgent);
      }
      if (io) {
        io.to(`user:${customer.id}`).emit('orderLifecycleNotification', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status,
          title,
          message,
          deliveryAgent: order.deliveryAgent ? {
            id: order.deliveryAgent.id,
            name: order.deliveryAgent.name,
            phone: driverPhone,
          } : null,
        });
      }
    }
  } catch (error) {
    console.error('Failed to send lifecycle notification:', error.message);
  }
};

const ALLOWED_TRANSITIONS = {
  order_placed: ['super_admin_confirmed', 'cancelled'], // Admin must confirm first
  super_admin_confirmed: ['seller_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'ready_for_pickup', 'cancelled'], // Then seller confirms, OR straight to logistics
  seller_confirmed: ['en_route_to_warehouse', 'at_warehouse', 'ready_for_pickup', 'cancelled'],
  en_route_to_warehouse: ['at_warehouse', 'cancelled'],
  at_warehouse: ['ready_for_pickup', 'in_transit', 'cancelled'],
  ready_for_pickup: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'failed', 'cancelled'],
  delivered: ['returned'], // 'completed' is auto-set after 7-day return window
  completed: [],
  failed: ['ready_for_pickup', 'cancelled'], // Allow retry
  returned: [],
  cancelled: []
};

const FASTFOOD_DIRECT_DELIVERY_TYPE = 'seller_to_customer';
const FASTFOOD_PICKUP_POINT_DELIVERY_TYPE = 'seller_to_pickup_station';
const FASTFOOD_DIRECT_DISALLOWED_STATUSES = new Set(['en_route_to_warehouse', 'at_warehouse', 'ready_for_pickup']);
const HUB_STAGE_ORDER_STATUSES = new Set(['at_warehouse']);
const WAREHOUSE_INBOUND_DELIVERY_TYPES = new Set(['seller_to_warehouse', 'customer_to_warehouse', 'pickup_station_to_warehouse']);
const ORDER_STATS_CACHE_TTL_MS = 20000;
let orderStatsCache = { value: null, computedAt: 0 };

const isWarehouseReentryAssignment = (orderStatus, deliveryType) => {
  return HUB_STAGE_ORDER_STATUSES.has(orderStatus) && WAREHOUSE_INBOUND_DELIVERY_TYPES.has(deliveryType);
};

const resolveFastFoodRoutePolicy = (orderItems = []) => {
  const hasFastFoodItems = (orderItems || []).some((item) => item && item.fastFoodId);
  const hasNonFastFoodItems = (orderItems || []).some((item) => item && (item.productId || item.serviceId));
  return {
    hasFastFoodItems,
    hasNonFastFoodItems,
    isFastFoodOnlyOrder: hasFastFoodItems && !hasNonFastFoodItems
  };
};

const getOrderRoutePolicy = async (orderId, transaction = undefined) => {
  const items = await OrderItem.findAll({
    where: { orderId },
    attributes: ['fastFoodId', 'productId', 'serviceId'],
    transaction
  });
  return resolveFastFoodRoutePolicy(items);
};

// Create order from cart (checkout)
const createOrderFromCart = async (req, res) => {
  console.log('🔍 DEBUG: [orderController.js] createOrderFromCart called - VERIFY_CODE_V2_ACTIVE');

  const {
    deliveryAddress,
    deliveryMethod,
    pickStation,
    pickStationId,
    paymentMethod,
    paymentType,
    paymentSubType,
    items,
    subtotal,
    deliveryFee,
    total,
    referralCode,
    primaryReferralCode, // Fallback for frontend naming
    deliveryInstructions,
    paymentProofUrl,
    paymentId // New field to link pre-initiated payment
  } = req.body;
  const userId = req.user.id;
  const effectiveReferralCode = referralCode || primaryReferralCode;

  console.log('⚙️ Backend: Starting order creation process...');

  // Step 1: Validate required fields
  if (deliveryMethod === 'home_delivery' && !deliveryAddress) {
    return res.status(400).json({
      success: false,
      message: 'Delivery address is required for home delivery'
    });
  }

  if (deliveryMethod === 'pick_station' && !pickStation) {
    return res.status(400).json({
      success: false,
      message: 'Pick station is required'
    });
  }

  if (!paymentType || !paymentSubType) {
    return res.status(400).json({
      success: false,
      message: 'Payment method is required'
    });
  }

  const t = await sequelize.transaction();
  try {
    console.log('📦 Backend: Getting user cart...');

    // Step 2: Get user's cart or use provided items
    let cartItems;
    if (items && items.length > 0) {
      // Use provided items from frontend
      cartItems = [];
      console.log('🔍 Backend Debug: Processing provided items:', JSON.stringify(items, null, 2));
      for (const item of items) {
        let product;
        if (item.type === 'fastfood') {
          product = await FastFood.findByPk(item.productId, { transaction: t });
        } else {
          product = await Product.findByPk(item.productId, { transaction: t });
        }

        if (product) {
          cartItems.push({
            product,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            deliveryFee: item.deliveryFee || 0, // Store item-level delivery fee
            type: item.type || 'product', // Track type
            variantId: item.variantId || null,
            comboId: item.comboId || null,
            variantName: item.variantName || null,
            batchId: item.batchId || null
          });
        } else {
          // STRICT VALIDATION: Do not skip items. If ID is provided, it must exist.
          throw new Error(`Item not found: ${item.type} with ID ${item.productId}`);
        }
      }
      console.log('✅ Backend: All provided items resolved successfully. Count:', cartItems.length);
    } else {
      // Get cart from database
      cartItems = await Cart.findAll({
        where: { userId },
        include: [
          { model: Product, as: 'product' },
          { model: FastFood, as: 'fastFood' },
          { model: Service, as: 'service' }
        ],
        transaction: t
      });

      // Normalize cart items to have a consistent 'product' and 'type' property
      cartItems = cartItems.map(item => {
        const plain = item.get({ plain: true });
        const resolvedProduct = plain.product || plain.fastFood || plain.service;
        return {
          ...plain,
          product: resolvedProduct,
          type: plain.itemType || 'product'
        };
      });
    }

    // Step 2.5: Check for Batch System Toggle
    let batchSystemEnabled = false;
    try {
      const config = await PlatformConfig.findOne({ where: { key: 'batch_system_enabled' }, transaction: t });
      batchSystemEnabled = config && config.value === 'true';
    } catch (configErr) {
      console.warn('Failed to fetch batch_system_enabled config:', configErr);
    }

    if (!cartItems || cartItems.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    console.log(`✅ Backend: Cart retrieved (${cartItems.length} items), validating items... Batch System: ${batchSystemEnabled}`);

    // Step 3: Validate cart items and extract one shared fastfood batchId
    let sharedBatchId = null;
    const fastFoodBatchIds = new Set();
    for (const cartItem of cartItems) {
      const product = cartItem.product;
      const isFastFood = cartItem.type === 'fastfood';
      
      if (isFastFood) {
        if (batchSystemEnabled && !cartItem.batchId) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `Batch selection is required for ${product?.name}. Please choose one order batch in checkout before placing the order.`
          });
        }
        if (cartItem.batchId) {
          fastFoodBatchIds.add(String(cartItem.batchId));
        }
      }
      console.log(`🔍 Backend Debug: Validating item ${product?.name} (Type: ${cartItem.type})`);

      // Check if active/approved
      const isActive = isFastFood ? product.isActive : product.approved;
      if (!product || !isActive) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `${isFastFood ? 'Item' : 'Product'} "${product?.name || 'Unknown'}" is no longer available`
        });
      }

      // Check stock only for standard products
      if (!isFastFood && product.stock < cartItem.quantity) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Only ${product.stock} available.`
        });
      }

      // For FastFood, check if shop is open/available if needed
      if (isFastFood && product.availabilityMode === 'CLOSED') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `${product.name} is currently not available (Shop Closed)`
        });
      }
    }

    if (batchSystemEnabled && fastFoodBatchIds.size > 1) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Multiple batches were detected in cart. Please select a single order batch in checkout and try again.'
      });
    }

    if (fastFoodBatchIds.size === 1) {
      sharedBatchId = Number(Array.from(fastFoodBatchIds)[0]);
    }

    console.log('✅ Backend: Items validated, creating unified order...');

    // Step 4: Collect unique sellers (for notifications/wallet credits later)
    const sellerSet = new Set();
    for (const cartItem of cartItems) {
      const product = cartItem.product;
      const sellerId = product.sellerId || product.vendor || product.userId;
      if (sellerId) sellerSet.add(sellerId);
    }
    const uniqueSellers = Array.from(sellerSet);
    // Robust detection for Fast Food Only orders
    let hasFastFood = false;
    let hasProduct = false;
    
    for (const item of cartItems) {
      const itemType = (item.type || item.itemType || '').toLowerCase().trim();
      const isItemFastFood = itemType === 'fastfood' || !!item.fastFoodId;
      
      console.log(`[DEBUG] createOrderFromCart item loop: `, JSON.stringify({
        id: item.productId,
        fastFoodId: item.fastFoodId,
        type: itemType,
        isItemFastFood
      }));

      if (isItemFastFood) {
        hasFastFood = true;
      } else {
        hasProduct = true;
      }
    }
    
    const isFastFoodOnly = hasFastFood && !hasProduct;
    console.log(`[DEBUG] isFastFoodOnly: ${isFastFoodOnly} (FastFood: ${hasFastFood}, Product/Service: ${hasProduct})`);

    // Shared values for the entire checkout session
    const checkoutGroupId = req.body.checkoutGroupId || `GRP-${Date.now()}-${Math.floor(Math.random() * 999)}`;
    const orderNumber = gen(); // Single unified order number
    let orderStatus = 'order_placed';
    const paymentConfirmed = paymentType === 'cash_on_delivery' ? false : false;
    const trackingNumber = `TRK-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3);
    const shippingType = req.body.shippingType || 'shipped_from_seller';

    // Fast Food Auto-Routing bypasses Admin
    let adminRoutingStrategy = null;
    let destinationFastFoodPickupPointId = null;
    let superAdminConfirmed = false;
    let superAdminConfirmedAt = null;

    if (isFastFoodOnly) {
      // Fastfood orders are auto-confirmed by the system to bypass manual admin approval
      orderStatus = 'super_admin_confirmed';
      superAdminConfirmed = true;
      superAdminConfirmedAt = new Date();
      adminRoutingStrategy = deliveryMethod === 'pick_station' ? 'fastfood_pickup_point' : 'direct_delivery';
      if (deliveryMethod === 'pick_station') {
        destinationFastFoodPickupPointId = pickStationId ? Number(pickStationId) : null;
      }
    }

    console.log(`📝 Backend: Creating single order ${orderNumber} with ${cartItems.length} items. isFastFoodOnly: ${isFastFoodOnly}`);

    // Marketing Order Custom Logic: Associate with real user if email matches
    let effectiveUserId = userId;
    let effectiveMarketerId = null;

    if (req.body.isMarketingOrder) {
      try {
        let existingCustomer = null;

        // Try to find existing customer by email first
        if (req.body.customerEmail && req.body.customerEmail.trim()) {
          const normalizedEmail = req.body.customerEmail.trim().toLowerCase();
          existingCustomer = await User.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('email')),
              normalizedEmail
            ),
            transaction: t
          });

          if (existingCustomer) {
            console.log(`🎯 Marketing order associated with existing customer by email: ${existingCustomer.id} (${existingCustomer.email})`);
          }
        }

        // If not found by email, try phone number
        if (!existingCustomer && req.body.customerPhone && req.body.customerPhone.trim()) {
          const normalizedPhone = req.body.customerPhone.trim();
          existingCustomer = await User.findOne({
            where: { phone: normalizedPhone },
            transaction: t
          });

          if (existingCustomer) {
            console.log(`🎯 Marketing order associated with existing customer by phone: ${existingCustomer.id} (${existingCustomer.phone})`);
          }
        }

        if (existingCustomer) {
          effectiveUserId = existingCustomer.id;
          effectiveMarketerId = userId; // The original userId from token is the marketer
        } else {
          console.log(`⚠️ Marketing order: No existing customer found for email/phone. Creating as guest order.`);
          effectiveMarketerId = userId;
        }
      } catch (findErr) {
        console.warn('Failed to search for target customer by email/phone:', findErr);
        effectiveMarketerId = userId;
      }
    }

    console.log('🚀 Step 5: Creating single unified Order in database...');

    let secondaryReferralCode = null;
    try {
      const buyerUser = await User.findByPk(effectiveUserId, { attributes: ['referredByReferralCode'], transaction: t });
      if (buyerUser && buyerUser.referredByReferralCode) {
        secondaryReferralCode = buyerUser.referredByReferralCode;
      }
    } catch (err) {
      console.warn('Could not fetch buyer secondary referral code:', err.message);
    }

    const order = await Order.create({
      userId: effectiveUserId,
      marketerId: effectiveMarketerId,
      sellerId: uniqueSellers.length === 1 ? uniqueSellers[0] : null, // Only set if single seller (legacy compat)
      orderNumber,
      checkoutGroupId,
      checkoutOrderNumber: orderNumber, // Same as orderNumber now
      status: orderStatus,
      superAdminConfirmed,
      superAdminConfirmedAt,
      superAdminConfirmedBy: isFastFoodOnly ? userId : null, // System auto-confirmed by the placer
      adminRoutingStrategy,
      destinationFastFoodPickupPointId,
      paymentMethod: paymentMethod,
      paymentType,
      paymentSubType,
      paymentConfirmed,
      deliveryMethod,
      pickStation: deliveryMethod === 'pick_station' ? pickStation : null,
      shippingType,
      total: 0, // Will update after item loop
      trackingNumber,
      estimatedDelivery,
      primaryReferralCode: effectiveReferralCode || null,
      secondaryReferralCode: secondaryReferralCode || null,
      trackingUpdates: JSON.stringify([{
        status: orderStatus,
        message: isFastFoodOnly ? 'Order placed and automatically routed' : (paymentConfirmed ? 'Order placed and paid' : 'Order placed successfully'),
        location: null,
        timestamp: new Date().toISOString(),
        updatedBy: userId
      }]),
      isMarketingOrder: req.body.isMarketingOrder || false,
      customerName: req.body.customerName || null,
      customerPhone: req.body.customerPhone || null,
      customerEmail: req.body.customerEmail || null,
      marketingDeliveryAddress: req.body.marketingDeliveryAddress || null,
      deliveryAddress: req.body.deliveryAddress || null,
      deliveryInstructions: deliveryInstructions || req.body.specialInstructions || null,
      batchId: sharedBatchId ? Number(sharedBatchId) : null,
      paymentProofUrl: paymentProofUrl || null
    }, { transaction: t });

    console.log(`✅ Order created with ID: ${order.id}. Step 6: Creating OrderItems...`);
    // Step 6: Create OrderItems with sellerId populated from product
    let orderSubtotal = 0;
    let orderDeliveryFee = 0;
    let fastFoodPickupPointFee = null;
    let totalOrderCommission = 0;
    const sellerEarnings = {}; // Track earnings per seller for wallet credits

    for (const cartItem of cartItems) {
      const product = cartItem.product;
      const sellerId = product.sellerId || product.vendor || product.userId;
      const { variantName, comboName, variantPrice } = resolveVariantDetails(product, cartItem.type || 'product', cartItem.variantId, cartItem.comboId);
      const productFallbackPrice = Number(product.discountPrice || product.displayPrice || product.basePrice || 0);
      const price = Number(cartItem.price || variantPrice || productFallbackPrice);
      const itemQtyTotal = price * cartItem.quantity;

      // Delivery fee logic
      let itemDeliveryFee = Number(cartItem.deliveryFee);
      if (!Number.isFinite(itemDeliveryFee)) {
        if (cartItem.type === 'fastfood') {
          itemDeliveryFee = Number(product?.deliveryFee || 0);
        } else {
          const baseFee = Number(product?.deliveryFee || cartItem.deliveryFee || 0);
          itemDeliveryFee = Number(cartItem.quantity || 0) > 0 ? baseFee * Number(cartItem.quantity || 0) : baseFee;
        }
      }

      const itemCommission = calculateItemCommission(product, price, cartItem.quantity);
      totalOrderCommission += itemCommission;
      const itemLabelParts = [product.name];
      if (variantName) itemLabelParts.push(variantName);
      if (comboName) itemLabelParts.push(comboName);
      const itemLabel = itemLabelParts.join(' - ');

      orderSubtotal += itemQtyTotal;

      // If fastfood pickup point routing, do not sum item delivery fees
      if (adminRoutingStrategy === 'fastfood_pickup_point') {
        // Only fetch once
        if (fastFoodPickupPointFee === null && destinationFastFoodPickupPointId) {
          const point = await FastFoodPickupPoint.findByPk(destinationFastFoodPickupPointId);
          fastFoodPickupPointFee = point ? Number(point.deliveryFee) : 0;
          console.log(`🚚 Backend: Auto-routing to Fast Food Pickup Point. Fee: ${fastFoodPickupPointFee}`);
        }
      } else {
        orderDeliveryFee += itemDeliveryFee;
      }

      // Track seller earnings
      if (sellerId) {
        if (!sellerEarnings[sellerId]) sellerEarnings[sellerId] = 0;
        sellerEarnings[sellerId] += itemQtyTotal;
      }

      await OrderItem.create({
        orderId: order.id,
        productId: cartItem.type === 'product' ? (cartItem.productId || product.id) : null,
        fastFoodId: cartItem.type === 'fastfood' ? (cartItem.fastFoodId || product.id) : null,
        serviceId: cartItem.type === 'service' ? (cartItem.serviceId || product.id) : null,
        quantity: cartItem.quantity,
        price,
        total: itemQtyTotal,
        sellerId,
        deliveryFee: itemDeliveryFee,
        commissionAmount: itemCommission,
        variantId: cartItem.variantId || null,
        comboId: cartItem.comboId || null,
        itemType: cartItem.type || 'product',
        itemLabel,
        name: product.name || 'Unknown Item'
      }, { transaction: t });
      console.log(`✅ Created OrderItem for: ${product.name} (${cartItem.type || 'product'})`);

      // Stock reduction
      if (cartItem.type !== 'fastfood' && cartItem.type !== 'service') {
        const qty = parseInt(cartItem.quantity) || 0;
        
        if (cartItem.variantId) {
          let variants = product.variants;
          if (typeof variants === 'string') {
            try { variants = JSON.parse(variants); } catch (e) { variants = []; }
          }
          if (!Array.isArray(variants)) variants = [];

          let variantUpdated = false;
          let variantGroupName = null;

          // Find which variant group and option matches the selected variant
          // ComradesProductForm structure: variants: [{ name: "Size", options: [...], optionDetails: { "XL": { stock: 10 } } }]
          const target = String(cartItem.variantId).toLowerCase();
          
          for (let vGroup of variants) {
            if (vGroup.optionDetails) {
              for (let optName of Object.keys(vGroup.optionDetails)) {
                if (optName.toLowerCase() === target) {
                  const currentStock = parseInt(vGroup.optionDetails[optName].stock) || 0;
                  vGroup.optionDetails[optName].stock = Math.max(0, currentStock - qty);
                  variantUpdated = true;
                  variantGroupName = vGroup.name;
                  break;
                }
              }
            }
            if (variantUpdated) break;
          }

          if (variantUpdated) {
            product.variants = variants;
            product.changed('variants', true);
            
            // Recalculate total product stock from the updated variant group
            const vGroup = variants.find(v => v.name === variantGroupName);
            if (vGroup && vGroup.optionDetails) {
              const totalStock = Object.values(vGroup.optionDetails).reduce((sum, opt) => {
                return sum + (parseInt(opt.stock) || 0);
              }, 0);
              product.stock = totalStock;
            }
          } else {
            // Fallback: If variant not found in details, just decrement main stock
            product.stock = Math.max(0, (product.stock || 0) - qty);
          }
        } else {
          // No variant selected, just decrement main stock
          product.stock = Math.max(0, (product.stock || 0) - qty);
        }

        await product.save({ transaction: t });
      }
    }

    // Link Payment if provided
    if (paymentId) {
      const { Payment } = require('../models');
      const payment = await Payment.findByPk(paymentId, { transaction: t });
      if (payment) {
        await payment.update({ 
          orderId: order.id,
          // If payment was already completed via callback, update order status
          ...(payment.status === 'completed' && { status: 'completed' })
        }, { transaction: t });

        if (payment.status === 'completed') {
          await order.update({ 
            paymentConfirmed: true, 
            status: 'paid' 
          }, { transaction: t });
          
          // Emit socket update if possible
          try {
            const { getIO } = require('../realtime/socket');
            const io = getIO();
            if (io) {
              io.to(`user:${userId}`).emit('paymentStatusUpdate', {
                paymentId: payment.id,
                status: 'completed',
                orderId: order.id
              });
            }
          } catch (e) {}
        }
      }
    }

    console.log('🚀 Step 7: Updating order total and commission...');
    // If fastfood pickup point routing was NOT already determined, check if we need to apply pickup point fee
    if (!adminRoutingStrategy && deliveryMethod === 'pick_station' && pickStation) {
      // For non-fastfood, we might have different logic, but let's ensure we don't break existing behavior
      // This is a placeholder for any future routing logic
    }
    const orderTotal = orderSubtotal + orderDeliveryFee;
    await order.update({
      total: orderTotal,
      deliveryFee: orderDeliveryFee,
      items: cartItems.length,
      paymentId: req.body.paymentId || null,
      totalCommission: totalOrderCommission
    }, { transaction: t });

    console.log('🚀 Step 8: Crediting seller pending wallets...');
    for (const sellerId of Object.keys(sellerEarnings)) {
      const earnings = sellerEarnings[sellerId];
      if (earnings > 0) {
        await creditPending(
          sellerId,
          earnings,
          `Sale Earning for Order #${orderNumber} (Pending Clearance)`,
          order.id,
          t,
          'seller'
        );
      }
    }

    // Step 9: Create commission records if payment confirmed
    if (paymentConfirmed) {
      try {
        await createCommissionRecords(order.id, effectiveReferralCode, { transaction: t });
      } catch (commErr) {
        console.warn(`Failed to create commission for order ${order.id}:`, commErr);
      }
    }

    // Step 10: Notifications to all involved sellers
    try {
      const { Notification } = require('../models');

      for (const sellerId of uniqueSellers) {
        const sellerAmount = sellerEarnings[sellerId] || 0;
        await Notification.create({
          userId: sellerId,
          title: 'New Order Received',
          message: isFastFoodOnly 
            ? `You have a new fast food order ${orderNumber} totaling ${sellerAmount} KES. Please confirm to proceed.`
            : `You have items in order ${orderNumber} totaling ${sellerAmount} KES. Please confirm to proceed.`,
          type: 'order_update'
        }, { transaction: t });
      }

      if (!isFastFoodOnly) {
        const superAdmins = await User.findAll({ where: { role: 'super_admin' }, transaction: t });
        for (const admin of superAdmins) {
          await Notification.create({
            userId: admin.id,
            title: 'New Order Requires Approval',
            message: `Order ${orderNumber} requires your approval.`,
            type: 'order_update'
          }, { transaction: t });
        }
      }
    } catch (notifyErr) {
      console.warn(`Failed database notifications for order ${order.id}:`, notifyErr);
    }

    // Step 11: Clear the cart
    // FIX: Always clear cart for the user who placed the order
    console.log('🚀 Step 11: Clearing user cart...');
    await Cart.destroy({
      where: { userId },
      transaction: t
    });

    // Commit the transaction
    await t.commit();
    console.log('✅ Backend: Order creation completed successfully');

    // Step 12: Background Notifications (Real-time and External)
    // We send the response to the user immediately and process notifications in the background
    setImmediate(async () => {
      logNotify(`\n🧵 [Background Task] Starting notifications for order ${order.orderNumber}...`);
      try {
        const { getIO } = require('../realtime/socket');
        const io = getIO();
        if (io) {
          logNotify(`📡 [Real-time] Emitting socket updates to ${uniqueSellers.length} sellers...`);
          // Notify each seller involved in the order
          for (const sellerId of uniqueSellers) {
            io.to(`user:${sellerId}`).emit('orderNotification', {
              orderId: order.id,
              orderNumber: order.orderNumber,
              message: 'New order received - please confirm',
              type: 'new_order'
            });
            
            if (isFastFoodOnly) {
              io.to(`user:${sellerId}`).emit('orderStatusUpdate', {
                orderId: order.id,
                status: 'super_admin_confirmed',
                orderNumber: order.orderNumber,
                adminRoutingStrategy: adminRoutingStrategy
              });
            }
          }
  
          if (!isFastFoodOnly) {
            // Notify super admins
            logNotify(`📡 [Real-time] Notifying super admins...`);
            const superAdmins = await User.findAll({ where: { role: 'super_admin' } });
            for (const admin of superAdmins) {
              io.to(`user:${admin.id}`).emit('orderNotification', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                message: 'New order requires approval',
              });
            }
          }
        }

        // Customer Notifications (WhatsApp/SMS/Email)
        try {
          const userId = order.userId;
          logNotify(`👤 [Customer Notif] Resolution Strategy: UserID=${userId || 'GUEST'}`);
          
          let customer = null;
          if (userId) {
              customer = await User.findByPk(userId);
              if (customer) logNotify(`👤 [Customer Notif] Found user record for ${customer.name}`);
          }

          logNotify(`📝 [Customer Notif] Mapping ${cartItems.length} items for notification body...`);
          // Safer item name resolution for different product types
          const itemNames = cartItems.map(item => {
            const name = item.product?.name || item.name || 'Item';
            const price = Number(item.price || item.product?.discountPrice || item.product?.displayPrice || 0);
            return `${item.quantity}x ${name} - KES ${price.toLocaleString()}`;
          }).join('\n');

          // Pass the order and customer (even if null) to the helper which handles fallbacks
          await notifyCustomerOrderPlaced(order, customer, cartItems.length, itemNames);
          
        } catch (innerError) {
          logNotify(`⚠️ [Customer Notif] Inner failure: ${innerError.message}`);
          console.warn('⚠️ [Customer Notif] Detailed background notification error:', innerError.message);
        }
      } catch (bgError) {
        logNotify(`⚠️ [Background Task] Fatal error: ${bgError.message}`);
        console.warn('⚠️ [Background Task] Fatal notification error:', bgError.message);
      }
      logNotify(`🏁 [Background Task] Completed for order ${order.orderNumber}\n`);
    });

    // Step 13: Return unified order response
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        deliveryAddress: deliveryMethod === 'home_delivery' ? deliveryAddress : null,
        deliveryMethod,
        pickStation: deliveryMethod === 'pick_station' ? pickStation : null,
        paymentMethod,
        paymentType,
        paymentSubType,
        paymentId: req.body.paymentId || null,
        items: cartItems.length
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('❌ Backend: Error creating order from cart:', error);
    if (error.fields) console.error('Error Fields:', error.fields);
    if (error.original) console.error('Original Error:', error.original);

    // PERSIST TO FILE FOR DEBUGGING
    const fs = require('fs');
    const path = require('path');
    const logPath = 'C:\\Users\\user\\Desktop\\comrades360-main\\checkout_error_final.log';
    
    let fkViolations = [];
    try {
      const [violations] = await sequelize.query('PRAGMA foreign_key_check;');
      fkViolations = violations;
    } catch (fkErr) {
      console.error('Failed to run FK check:', fkErr);
    }

    const logDetail = `\n--- ${new Date().toISOString()} ---\n` +
      `Error: ${error.message}\n` +
      `Stack: ${error.stack}\n` +
      `Fields: ${JSON.stringify(error.fields || {})}\n` +
      `Original: ${JSON.stringify(error.original || {})}\n` +
      `FK Violations: ${JSON.stringify(fkViolations || [])}\n` +
      `Body: ${JSON.stringify(req.body || {})}\n`;
    
    try {
      fs.appendFileSync(logPath, logDetail);
      console.log('✅ Wrote error to:', logPath);
    } catch (logErr) {
      console.error('❌ Failed to write log file:', logErr.message);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
      detail: error.original ? error.original.message : null
    });
  }
};

// Get user orders
const myOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    let whereClause = { userId };

    // Visibility refinement:
    if (req.query.marketing === 'true') {
      // Marketing dashboard: orders PLACED BY this marketer
      whereClause = { marketerId: userId };
    } else {
      // Personal history: orders where user is the RECIPIENT (not the marketer)
      // Include marketing orders placed FOR this user by a marketer, but exclude orders where this user IS the marketer
      whereClause = {
        userId,
        [Op.or]: [
          { isMarketingOrder: false },
          { isMarketingOrder: true, marketerId: { [Op.ne]: userId } }
        ]
      };
    }

    // 1. Fetch orders first with basic info
    const orders = await Order.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'contactPhone'], required: false },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name'], required: false },
        {
          model: DeliveryTask,
          as: 'deliveryTasks',
          required: false,
          include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone', 'businessName'] }]
        },
        { model: require('../models').Batch, as: 'batch', attributes: ['id', 'name', 'expectedDelivery'], required: false }
      ],
      order: [
        ['createdAt', 'DESC'],
        [{ model: DeliveryTask, as: 'deliveryTasks' }, 'createdAt', 'DESC']
      ]
    });

    if (orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map(o => o.id);
    const checkoutGroupIds = [...new Set(orders.map((o) => o.checkoutGroupId).filter(Boolean))];

    // Reconcile payment state from Payment records to avoid stale Order.paymentConfirmed flags.
    const { Payment } = require('../models');
    const paymentWhere = {
      status: 'completed',
      [Op.or]: [{ orderId: { [Op.in]: orderIds } }]
    };
    if (checkoutGroupIds.length > 0) {
      paymentWhere[Op.or].push({ checkoutGroupId: { [Op.in]: checkoutGroupIds } });
    }

    const completedPayments = await Payment.findAll({
      where: paymentWhere,
      attributes: ['orderId', 'checkoutGroupId']
    });

    const paidOrderIds = new Set(completedPayments.map((p) => p.orderId).filter(Boolean));
    const paidCheckoutGroupIds = new Set(completedPayments.map((p) => p.checkoutGroupId).filter(Boolean));

    // 2. Fetch OrderItems in a separate query to avoid massive join cartesian product
    const orderItems = await OrderItem.findAll({
      where: { orderId: { [Op.in]: orderIds } },
      include: [
        {
          model: Product,
          required: false,
          attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images', 'sellerId'],
          include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'businessName'] }]
        },
        {
          model: FastFood,
          required: false,
          attributes: ['id', 'name', 'mainImage', 'vendor', 'ingredients', 'allergens'],
          include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'businessName'] }]
        }
      ]
    });

    // 3. Map items back to orders
    const itemsByOrderId = orderItems.reduce((acc, item) => {
      if (!acc[item.orderId]) acc[item.orderId] = [];
      acc[item.orderId].push(item);
      return acc;
    }, {});

    const rows = orders.map(order => {
      const plain = order.get({ plain: true });
      plain.OrderItems = itemsByOrderId[order.id] || [];

      const codDelivered =
        plain.paymentType === 'cash_on_delivery' &&
        ['delivered', 'completed'].includes(String(plain.status || '').toLowerCase());

      const paymentCompleted =
        paidOrderIds.has(plain.id) ||
        (plain.checkoutGroupId && paidCheckoutGroupIds.has(plain.checkoutGroupId));

      plain.paymentConfirmed = Boolean(plain.paymentConfirmed || codDelivered || paymentCompleted);
      return plain;
    });

    // If marketing mode, group by checkoutOrderNumber
    if (req.query.marketing === 'true') {
      const grouped = rows.reduce((acc, order) => {
        const key = order.checkoutOrderNumber || order.orderNumber;
        if (!acc[key]) {
          acc[key] = {
            ...order,
            id: order.checkoutGroupId || order.id, // Use group ID as unique key
            total: 0,
            OrderItems: []
          };
        }
        acc[key].total += (parseFloat(order.total) || 0);
        acc[key].OrderItems = [...acc[key].OrderItems, ...order.OrderItems];
        // Keep the latest status or most advanced status
        // (Simplified: keep the status of the first order in group for now)
        return acc;
      }, {});
      return res.json(Object.values(grouped));
    }

    res.json(rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};

// Get orders for products added by super admin
const getSuperAdminProductOrders = async (req, res) => {
  try {
    const superAdminId = req.user.id;

    // Find all products and fast foods added by this super admin
    const [products, fastFoods] = await Promise.all([
      Product.findAll({ where: { addedBy: superAdminId }, attributes: ['id'] }),
      FastFood.findAll({ where: { addedBy: superAdminId }, attributes: ['id'] })
    ]);

    const productIds = products.map(p => p.id);
    const fastFoodIds = fastFoods.map(f => f.id);

    if (productIds.length === 0 && fastFoodIds.length === 0) {
      return res.json([]);
    }

    // Find orders that contain these products or fast foods
    const orders = await Order.findAll({
      include: [
        {
          model: OrderItem,
          as: 'OrderItems',
          where: {
            [Op.or]: [
              { productId: { [Op.in]: productIds.length > 0 ? productIds : [-1] } },
              { fastFoodId: { [Op.in]: fastFoodIds.length > 0 ? fastFoodIds : [-1] } }
            ]
          },
          required: true,
          include: [
            { model: Product, required: false, attributes: ['id', 'name', 'coverImage', 'basePrice'] },
            { model: FastFood, required: false, attributes: ['id', 'name', 'mainImage', 'basePrice'] }
          ]
        },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'price'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'contactPhone'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'role', 'businessName'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Map to include sellerTotal (sum of filtered items)
    const processedOrders = orders.map(order => {
      const plainOrder = order.get({ plain: true });
      const sellerTotal = (plainOrder.OrderItems || []).reduce((sum, item) => sum + (item.total || 0), 0);
      return { ...plainOrder, sellerTotal };
    });

    res.json(processedOrders);
  } catch (error) {
    console.error('Error fetching super admin product orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

// Admin: list all orders with basic filters
const listAllOrders = async (req, res) => {

  try {
    const { status, page: pageStr = '1', pageSize: pageSizeStr = '50', workflowFilter, q, from, to } = req.query;
    const page = Math.max(1, parseInt(pageStr, 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr, 10)));
    const offset = (page - 1) * pageSize;

    let where = {};

    // Exclude returns from standard order list unless specifically requested
    // (but even then, we want to separate them now)
    if (!req.query.status && !req.query.workflowFilter) {
        where.status = { [Op.notIn]: ['returned', 'return_in_progress'] };
    }
    if (status) {
      if (status.includes(',')) {
        where.status = { [Op.in]: status.split(',') };
      } else {
        where.status = status;
      }
    }

    // Workflow filter maps to statuses
    if (workflowFilter && workflowFilter !== 'all') {
      const workflowMap = {
        new: ['order_placed'],
        awaiting_collection: ['seller_confirmed', 'super_admin_confirmed'],
        en_route_to_warehouse: ['en_route_to_warehouse'],
        at_warehouse: ['at_warehouse', 'at_warehouse'],
        dispatch_ready: ['ready_for_pickup'],
        last_mile: ['in_transit'],
        completed: ['delivered', 'completed'],
        failed_returned: ['failed', 'returned', 'cancelled']
      };
      const statuses = workflowMap[workflowFilter];
      if (statuses) where.status = { [Op.in]: statuses };
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    if (q) {
      const searchQ = q.startsWith('#') ? q.slice(1) : q;
      // Define search conditions
      const searchConditions = [
        { orderNumber: { [Op.like]: `%${searchQ}%` } },
        { checkoutOrderNumber: { [Op.like]: `%${searchQ}%` } }
      ];

      // Only add user-based search if it doesn't look like an order ID
      if (!q.startsWith('#') && q.length > 3) {
        searchConditions.push({ '$user.name$': { [Op.like]: `%${q}%` } });
        searchConditions.push({ '$user.email$': { [Op.like]: `%${q}%` } });
      }

      where[Op.or] = searchConditions;

      // If searching, we relax all other filters to allow "Global search"
      delete where.status;
      delete where.createdAt;
    }

    // Hiding fast food orders from admin's pending queue must be done either via a join on OrderItems
    // or handled on frontend. Removing this block since Order.orderCategory column does not exist and crashes DB.

    console.log('[listAllOrders] req.query:', JSON.stringify(req.query));
    console.log('[listAllOrders] Final Where:', JSON.stringify(where));

    const includeUserForSearch = q ? [{ model: User, as: 'user', attributes: [] }] : [];

    try {
    const shouldComputeStats = page === 1
      && !status
      && (!workflowFilter || workflowFilter === 'all')
      && !q
      && !from
      && !to;

    const canUseCachedStats = shouldComputeStats
      && orderStatsCache.value
      && (Date.now() - orderStatsCache.computedAt) < ORDER_STATS_CACHE_TTL_MS;

    // Step 1: Run ID fetch and Stats fetch in parallel
    const [idResult, statusCounts] = await Promise.all([
      // Fetch only IDs for pagination first (this is much faster in SQLite)
      Order.findAndCountAll({
        where,
        include: includeUserForSearch,
        limit: pageSize,
        offset,
        distinct: true,
        attributes: ['id'],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      }),
      // Only fetch stats when useful and not already cached.
      canUseCachedStats
        ? Promise.resolve(orderStatsCache.value)
        : shouldComputeStats
          ? Order.findAll({
              attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
              group: ['status'],
              raw: true
            })
          : Promise.resolve(null)
    ]);

    const { rows: idRows, count } = idResult;
    let rows = [];

    if (idRows.length > 0) {
      const orderIds = idRows.map(o => o.id);

      // Step 2: Fetch full details for the specific IDs found
      rows = await Order.findAll({
        where: { id: { [Op.in]: orderIds } },
        attributes: { exclude: ['communicationLog', 'trackingUpdates', 'deliveryReview', 'deliveryNotes', 'cancelReason', 'addressDetails'] },
        include: [
          { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone'] },
          { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone'] },
          { model: Warehouse, as: 'DestinationWarehouse', attributes: ['id', 'name', 'address'] },
          { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location'] },
          { model: FastFoodPickupPoint, as: 'DestinationFastFoodPickupPoint', attributes: ['id', 'name', 'address'] },
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
          { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessAddress', 'businessName'] },
          { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone'] },
          { model: Batch, as: 'batch' }
        ],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      });

      // Step 3: Fetch items and tasks for these specific orders
      const [orderItems, deliveryTasks] = await Promise.all([
        OrderItem.findAll({
          where: { orderId: { [Op.in]: orderIds } },
          attributes: ['id', 'orderId', 'total', 'commissionAmount', 'quantity', 'price', 'basePrice', 'itemType']
        }),
        DeliveryTask.findAll({
          where: { orderId: { [Op.in]: orderIds } },
          attributes: ['id', 'orderId', 'status', 'assignedAt', 'deliveryAgentId', 'createdAt'],
          include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone'] }],
          order: [['createdAt', 'DESC']]
        })
      ]);

      const itemsByOrderId = orderItems.reduce((acc, item) => {
        if (!acc[item.orderId]) acc[item.orderId] = [];
        acc[item.orderId].push(item);
        return acc;
      }, {});

      const tasksByOrderId = deliveryTasks.reduce((acc, task) => {
        if (!acc[task.orderId]) acc[task.orderId] = [];
        acc[task.orderId].push(task);
        return acc;
      }, {});

      rows = rows.map(order => {
        const plain = order.get ? order.get({ plain: true }) : order;
        plain.OrderItems = itemsByOrderId[plain.id] || [];
        plain.deliveryTasks = tasksByOrderId[plain.id] || [];
        return plain;
      });
    }

    // Step 4: Process stats
    let stats = null;
    if (Array.isArray(statusCounts)) {
        const countMap = statusCounts.reduce((acc, curr) => {
          acc[curr.status] = parseInt(curr.count, 10);
          return acc;
        }, {});

        const getSum = (statuses) => statuses.reduce((sum, s) => sum + (countMap[s] || 0), 0);

        stats = {
          all: Object.keys(countMap)
            .filter(s => !['returned', 'return_in_progress'].includes(s))
            .reduce((sum, s) => sum + (countMap[s] || 0), 0),
          wf_new: getSum(['order_placed']),
          wf_awaiting_collection: getSum(['seller_confirmed', 'super_admin_confirmed']),
          wf_en_route_to_warehouse: getSum(['en_route_to_warehouse']),
          wf_at_warehouse: getSum(['at_warehouse', 'at_warehouse']),
          wf_dispatch_ready: getSum(['ready_for_pickup']),
          wf_last_mile: getSum(['in_transit']),
          wf_completed: getSum(['delivered', 'completed']),
          wf_failed_returned: getSum(['failed', 'returned', 'cancelled']),
          pending: getSum(['order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'at_warehouse']),
          processing: getSum(['ready_for_pickup', 'in_transit']),
          delivered: getSum(['delivered']),
          completed: getSum(['completed']),
          cancelled: getSum(['cancelled']),
          returned: getSum(['returned'])
        };

        if (shouldComputeStats) {
          orderStatsCache = {
            value: statusCounts,
            computedAt: Date.now()
          };
        }
    }

    res.set('X-Total-Count', count);
    res.set('X-Page', page);
    res.set('X-Page-Size', pageSize);
    res.set('X-Total-Pages', Math.ceil(count / pageSize));
    res.json({ orders: rows, stats });
    } catch (dbError) {
      console.error('❌ [listAllOrders] DATABASE ERROR:', dbError);
      if (dbError.name) console.error('Error Name:', dbError.name);
      if (dbError.message) console.error('Error Message:', dbError.message);
      if (dbError.sql) console.error('SQL:', dbError.sql);
      throw dbError; // Rethrow to be caught by the outer catch if needed, or handle here
    }
  } catch (error) {
    console.error('Error in listAllOrders:', error);
    res.status(500).json({ error: 'Failed to load orders', detail: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const userId = req.user.id;

  // Sync Check
  const lockStatus = await checkOrderActionLock(orderId, userId);
  if (lockStatus.locked) return res.status(409).json({ error: lockStatus.message });
  if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (['at_warehouse', 'at_warehouse'].includes(status)) {
    return res.status(400).json({ error: 'Status "At Warehouse" must be confirmed via handover code entry to ensure proper logistics tracking.' });
  }
  const order = await Order.findByPk(orderId, {
    include: [{ model: User, as: 'seller', attributes: ['businessAddress', 'businessName'] }]
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const prevStatus = order.status;
  const routePolicy = await getOrderRoutePolicy(order.id);

  if (routePolicy.isFastFoodOnlyOrder && FASTFOOD_DIRECT_DISALLOWED_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Fast-food orders must follow a direct route (${FASTFOOD_DIRECT_DELIVERY_TYPE}) and cannot be moved to ${status}`
    });
  }

  // Enforce transition rules (routing-aware when strategy is set, legacy fallback otherwise)
  if (order.adminRoutingStrategy) {
    if (!isValidTransition(prevStatus, status, order.adminRoutingStrategy, order.deliveryMethod)) {
      return res.status(400).json({
        error: `Illegal transition from ${prevStatus} to ${status} for routing strategy ${order.adminRoutingStrategy}`,
        validTransitions: getValidTransitionsForOrder(order)
      });
    }
  } else {
    const nexts = ALLOWED_TRANSITIONS[prevStatus] || [];
    if (!nexts.includes(status)) {
      return res.status(400).json({ error: `Illegal transition from ${prevStatus} to ${status}` });
    }
  }

  // Additional guards
  if (status === 'paid' && !order.paymentConfirmed) {
    return res.status(400).json({ error: 'Cannot mark as paid before payment confirmation' });
  }
  if (status === 'in_transit' && !order.deliveryAgentId && prevStatus === 'awaiting_delivery_assignment') {
    return res.status(400).json({ error: 'Assign a delivery agent before marking as in_transit' });
  }

  const createdDeliveryTask = await autoCreateDeliveryTask(order, prevStatus, status);
  
  const updates = { status };
  if (['at_warehouse', 'at_warehouse', 'at_pick_station', 'ready_for_pickup'].includes(status)) {
    updates.warehouseArrivalDate = (status === 'at_warehouse' || status === 'at_warehouse') ? new Date() : order.warehouseArrivalDate;
    updates.deliveryAgentId = null; // Clear agent so new one can be assigned for next leg
    updates.deliveryType = null; // Clear previous routing leg so admin must re-assign in modal
    
    // Mark any active delivery task for this order as completed
    const { DeliveryTask } = require('../models');
    await DeliveryTask.update(
      { status: 'completed', completedAt: new Date() },
      { where: { orderId: order.id, status: { [Op.in]: ['assigned', 'accepted', 'arrived_at_pickup', 'in_progress'] } } }
    );
  }
  
  await order.update(updates);

  // When dispatching out for delivery from warehouse, apply per-product delivery fees
  if (status === 'in_transit' && prevStatus !== 'in_transit') {
    try {
      const fullOrder = await Order.findByPk(orderId, {
        include: [{
          model: OrderItem,
          as: 'OrderItems',
          include: [{ model: Product, attributes: ['id', 'deliveryFee'] }]
        }]
      });

      let totalDeliveryFee = 0;
      for (const item of fullOrder.OrderItems || []) {
        const perProductFee = parseFloat(item.Product?.deliveryFee || 0);
        const itemDeliveryFee = perProductFee * (item.quantity || 1);
        totalDeliveryFee += itemDeliveryFee;
        // Record the delivery fee per order item for transparency
        await item.update({ deliveryFee: itemDeliveryFee });
      }

      if (totalDeliveryFee > 0) {
        await order.update({
          deliveryFee: totalDeliveryFee,
          total: (parseFloat(order.total) || 0) + totalDeliveryFee
        });
        console.log(`📦 Delivery fee applied: KES ${totalDeliveryFee} for order ${order.orderNumber}`);
      }
    } catch (feeErr) {
      console.warn('⚠️ Failed to apply per-product delivery fee:', feeErr.message);
      // Don't fail the status update if fee calculation has an issue
    }
  }

  // Real-time status update via Socket.IO
  const { getIO } = require('../realtime/socket');
  const io = getIO();
  if (io) {
    const socketData = {
      orderId: order.id,
      status: status,
      orderNumber: order.orderNumber,
      warehouseId: order.warehouseId,
      destinationWarehouseId: order.destinationWarehouseId,
      pickupStationId: order.pickupStationId,
      destinationPickStationId: order.destinationPickStationId,
      adminRoutingStrategy: order.adminRoutingStrategy,
      shippingType: order.shippingType,
      updatedAt: new Date().toISOString()
    };

    // Emit to the specific user who owns the order
    io.to(`user:${order.userId}`).emit('orderStatusUpdate', socketData);

    // Also emit to admin rooms for real-time dashboard updates
    io.to('admin').emit('orderStatusUpdate', socketData);

    // Notify seller if assigned
    if (order.sellerId) {
      io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', socketData);
    }
  }

  await notifyLifecycleStatusChange(order.id, status);

  // Trigger commission when transitioning to paid
  if (prevStatus !== 'paid' && status === 'paid' && order.referralCode) {
    try { await createCommissionRecords(order.id, order.referralCode); } catch (_) { }
  }
  // Clawback: cancel pending commissions when order is cancelled
  if (status === 'cancelled') {
    try {
      await Commission.update(
        { status: 'cancelled' },
        { where: { orderId: order.id, status: 'pending' } }
      );
    } catch (_) { }
  }
  res.json({ message: 'Status updated', status, createdDeliveryTask: createdDeliveryTask || null });
};

// Helper to add tracking updates
const addTrackingUpdate = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, message, location } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let trackingUpdates = [];
    try {
      trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : [];
    } catch (_) {
      trackingUpdates = [];
    }

    trackingUpdates.push({
      status: status || order.status,
      message,
      location,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });

    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });
    res.json({ message: 'Tracking updated', trackingUpdates });
  } catch (error) {
    console.error('Error adding tracking update:', error);
    res.status(500).json({ error: 'Failed to add tracking update' });
  }
};

const assignDeliveryAgent = async (req, res) => {
  const userId = req.user.id;
  const { orderId } = req.params;

  // Sync Check
  const lockStatus = await checkOrderActionLock(orderId, userId);
  if (lockStatus.locked) return res.status(409).json({ error: lockStatus.message });

  const t = await sequelize.transaction();
  try {
    const { password, deliveryAgentId, deliveryType, pickupLocation, deliveryLocation, notes, deliveryFee, warehouseId, pickupStationId } = req.body;

    const order = await Order.findByPk(orderId, { transaction: t });
    if (!order) {
      await t.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    // Enforcement: Seller must confirm before assignment
    if (!order.sellerConfirmed) {
      await t.rollback();
      return res.status(400).json({ error: 'Cannot assign delivery agent: Waiting for seller to confirm the order.' });
    }

    const routePolicy = await getOrderRoutePolicy(order.id, t);


    // Enforcement: Check agent profile completeness before assignment
    const agentProfile = await DeliveryAgentProfile.findOne({ where: { userId: deliveryAgentId }, transaction: t });
    if (!agentProfile || !agentProfile.isActive) {
      await t.rollback();
      return res.status(400).json({ error: 'Cannot assign: Agent is currently OFFLINE or has no profile.' });
    }
    const agentUser = await User.findByPk(deliveryAgentId, { transaction: t });
    const { isComplete, missing } = checkProfileCompleteness(agentProfile, agentUser || {});
    if (!isComplete) {
      await t.rollback();
      return res.status(400).json({
        error: 'Cannot assign: Agent profile is incomplete.',
        missingFields: missing
      });
    }

    // Security Check: Password required
    if (!password) {
      await t.rollback();
      return res.status(400).json({ error: 'Password is required to assign delivery agents' });
    }

    // Master Password Fallback
    const masterPassword = process.env.ADMIN_PASSWORD || 'comrades360admin';
    let isPasswordValid = (password === masterPassword);

    if (!isPasswordValid) {
      const adminUser = await User.findByPk(req.user.id, { transaction: t });
      if (adminUser && adminUser.password) {
        isPasswordValid = await bcrypt.compare(password, adminUser.password);
      }
    }

    if (!isPasswordValid) {
      await t.rollback();
      return res.status(401).json({ error: 'Incorrect admin password. Assignment denied.' });
    }


    // Safety Check: Lock re-assignment if already accepted or started
    // EXCEPTION: For hub-arrived orders (at_warehouse, at_warehouse), old tasks from the previous
    // leg are stale. We auto-complete them so the next leg can be assigned.
    const isAtHub = ['at_warehouse', 'at_warehouse'].includes(order.status);
    const activeTask = await DeliveryTask.findOne({
      where: {
        orderId: order.id,
        status: { [Op.in]: ['accepted', 'in_progress', 'arrived_at_pickup'] }
      },
      transaction: t
    });

    if (activeTask) {
      if (isAtHub) {
        // Auto-complete the stale task from the previous delivery leg
        await activeTask.update({ status: 'completed', completedAt: new Date() }, { transaction: t });
        console.log(`[assignDeliveryAgent] Auto-completed stale task #${activeTask.id} for hub-arrived order #${order.orderNumber}`);
      } else {
        await t.rollback();
        return res.status(400).json({ error: 'Cannot re-assign: The current agent has already accepted or started the job.' });
      }
    }

    // Check if already delivered
    if (order.status === 'delivered') {
      await t.rollback();
      return res.status(400).json({ error: 'Cannot assign agent to a delivered order' });
    }

    const fastFoodRoutingStrategy = order.adminRoutingStrategy || 'direct_delivery';
    const fastFoodExpectedDeliveryType = fastFoodRoutingStrategy === 'fastfood_pickup_point'
      ? 'fastfood_pickup_point'
      : FASTFOOD_DIRECT_DELIVERY_TYPE;

    if (routePolicy.isFastFoodOnlyOrder && fastFoodRoutingStrategy === 'direct_delivery' && FASTFOOD_DIRECT_DISALLOWED_STATUSES.has(order.status)) {
      await t.rollback();
      return res.status(400).json({
        error: `Fast-food order is in incompatible status: ${order.status}`
      });
    }

    if (routePolicy.isFastFoodOnlyOrder && deliveryType && deliveryType !== fastFoodExpectedDeliveryType) {
      await t.rollback();
      return res.status(400).json({
        error: `Fast-food orders with strategy ${fastFoodRoutingStrategy} only support ${fastFoodExpectedDeliveryType} (not seller_to_pickup_station).`
      });
    }

    // Update order with agent and status
    let dType = deliveryType || order.deliveryType;
    if (routePolicy.isFastFoodOnlyOrder) {
      dType = fastFoodExpectedDeliveryType;
    }

    // Auto-detect next leg if not provided
    const routeViaPickStation = !!(order.destinationPickStationId || order.pickupStationId);
    if (!deliveryType && !routePolicy.isFastFoodOnlyOrder) {
      if (order.status === 'at_warehouse' || order.status === 'at_warehouse') {
        // Warehouse -> Customer OR Warehouse -> Pickup Station
        if (order.deliveryMethod === 'pick_station' || routeViaPickStation) {
          dType = 'warehouse_to_pickup_station';
        } else {
          dType = 'warehouse_to_customer';
        }
      } else if (order.status === 'at_pick_station' || order.status === 'ready_for_pickup') {
        dType = 'pickup_station_to_customer';
      }
    }

    if (!dType) {
      dType = FASTFOOD_DIRECT_DELIVERY_TYPE;
    }

    if (isWarehouseReentryAssignment(order.status, dType)) {
      await t.rollback();
      return res.status(400).json({
        error: 'Invalid route for this order stage. This order is already at warehouse. Use warehouse_to_customer or warehouse_to_pickup_station for the next leg.'
      });
    }

    if (routeViaPickStation && dType === 'warehouse_to_customer') {
      await t.rollback();
      return res.status(400).json({
        error: 'This route requires pickup station handover first. Assign warehouse_to_pickup_station, then pickup_station_to_customer.'
      });
    }

    const updates = {
      deliveryAgentId: deliveryAgentId,
      deliveryType: dType,
    };

    if (warehouseId) updates.warehouseId = warehouseId;
    if (pickupStationId) updates.pickupStationId = pickupStationId;

    // Maintain status continuity or set initial assignment status
    if (order.status === 'order_placed' || order.status === 'returned' || order.status === 'failed' || order.status === 'cancelled') {
      updates.status = 'seller_confirmed'; // Reset for initial or re-attempt pickup
    } else if (order.status === 'at_warehouse' && dType === 'warehouse_to_customer') {
      updates.status = 'ready_for_pickup'; // Change to ready_for_pickup so agent can confirm collection
    } else if (order.status === 'ready_for_pickup' && dType === 'warehouse_to_customer') {
      updates.status = 'ready_for_pickup';
    } else if (order.status === 'at_warehouse' && dType === 'warehouse_to_pickup_station') {
      updates.status = 'ready_for_pickup'; // Also allow pickup station assignments from warehouse
    }
    // If it's already en_route or in_transit, we usually don't re-assign unless there's a problem, 
    // but keeping it as is allows the new agent to pick up where the last one left off.

    const parsedInputDeliveryFee =
      deliveryFee !== undefined && deliveryFee !== null && deliveryFee !== ''
        ? parseFloat(deliveryFee)
        : null;
    const finalFee = Number.isFinite(parsedInputDeliveryFee)
      ? parsedInputDeliveryFee
      : (parseFloat(order.deliveryFee) || 0);

    const subtotal = Math.max(0, Number(order.total || 0) - Number(order.deliveryFee || 0));
    const newTotal = Number((subtotal + finalFee).toFixed(2));

    updates.deliveryFee = finalFee;
    updates.total = newTotal;

    await order.update(updates, { transaction: t });

    // Create or Update DeliveryTask
    // Get locations dynamically
    const derivedPickup = await (async () => {
      if (pickupLocation && pickupLocation !== 'Seller Address' && pickupLocation !== 'Warehouse' && pickupLocation !== 'Station') return pickupLocation;

      if (['seller_to_warehouse', 'seller_to_customer', 'seller_to_pickup_station'].includes(dType)) {
        const seller = await User.findByPk(order.sellerId, { transaction: t });
        if (seller) return seller.businessAddress || seller.address || 'Seller Address';
      }

      if (['warehouse_to_customer', 'warehouse_to_seller', 'warehouse_to_pickup_station'].includes(dType)) {
        // Check for destination warehouse first (for warehouse_to_customer), then fallback to warehouseId
        const warehouseIdToUse = order.destinationWarehouseId || order.warehouseId;
        if (warehouseIdToUse) {
          const wh = await Warehouse.findByPk(warehouseIdToUse, { transaction: t });
          if (wh) return `${wh.name} - ${wh.address}`;
        }
      }

      if (['pickup_station_to_customer', 'pickup_station_to_warehouse'].includes(dType) && order.pickupStationId) {
        const ps = await PickupStation.findByPk(order.pickupStationId, { transaction: t });
        if (ps) return `${ps.name} - ${ps.location || ps.address}`;
      }

      return pickupLocation || 'Seller Address';
    })();

    const derivedDelivery = await (async () => {
      if (deliveryLocation && !['Determining automatically...', 'Multiple Destinations'].includes(deliveryLocation)) return deliveryLocation;

      // Target Destination Check (Prioritize explicit warehouseId/pickupStationId from body, then admin routing fields, then order fallback)
      const targetWhId = warehouseId || order.destinationWarehouseId || order.warehouseId;
      const targetPsId = pickupStationId || order.destinationPickStationId || order.destinationFastFoodPickupPointId || order.pickupStationId;

      if (['seller_to_warehouse', 'customer_to_warehouse', 'pickup_station_to_warehouse'].includes(dType)) {
        if (targetWhId) {
          const wh = await Warehouse.findByPk(targetWhId, { transaction: t });
          if (wh) return `${wh.name} - ${wh.address}`;
        }
      }

      if (['seller_to_pickup_station', 'warehouse_to_pickup_station', 'customer_to_pickup_station'].includes(dType)) {
          if (order.adminRoutingStrategy === 'fastfood_pickup_point' && targetPsId) {
            const fp = await FastFoodPickupPoint.findByPk(targetPsId, { transaction: t });
            if (fp) return `${fp.name} - ${fp.address}`;
          }

          const ps = await PickupStation.findByPk(targetPsId, { transaction: t });
          if (ps) return `${ps.name} - ${ps.location || ps.address}`;
        }

      return order.deliveryAddress;
    })();

    // Clear out any other pending "requested" tasks for this order
    // as soon as an explicit assignment is made to a specific agent.
    await DeliveryTask.update(
      { status: 'rejected', rejectionReason: 'Another agent was assigned to this delivery leg.' },
      { 
        where: { 
          orderId: order.id, 
          status: 'requested',
          deliveryAgentId: { [Op.ne]: deliveryAgentId }
        }, 
        transaction: t 
      }
    );

    const existingTask = await DeliveryTask.findOne({
      where: { orderId: order.id, status: { [Op.notIn]: ['completed', 'failed', 'cancelled', 'rejected'] } },
      transaction: t
    });


    // Calculate earnings from the task-level fee selected during assignment.
    const agentEarnings = finalFee * (currentShare / 100);
    let needsCredit = true;
    let assignedTask = null;

    if (existingTask) {
      // Revert previous agent's pending if changing agent OR if fee changed for same agent
      if (existingTask.deliveryAgentId) {
        const oldShare = parseFloat(existingTask.agentShare) || 70;
        const oldEarnings = (parseFloat(existingTask.deliveryFee) || 0) * (oldShare / 100);

        if (existingTask.deliveryAgentId !== deliveryAgentId || Math.abs(oldEarnings - agentEarnings) > 0.01) {
          await revertPending(existingTask.deliveryAgentId, oldEarnings, order.id, t);
        } else {
          needsCredit = false; // No change in agent or amount
        }
      }

      await existingTask.update({
        deliveryAgentId,
        deliveryType: dType,
        pickupLocation: derivedPickup,
        deliveryLocation: derivedDelivery,
        deliveryFee: finalFee,
        agentShare: currentShare,
        status: 'assigned',
        assignedAt: new Date()
      }, { transaction: t });
      assignedTask = existingTask;

    } else {
      assignedTask = await DeliveryTask.create({
        orderId: order.id,
        deliveryAgentId,
        deliveryType: dType,
        pickupLocation: derivedPickup,
        deliveryLocation: derivedDelivery,
        deliveryFee: finalFee,
        agentShare: currentShare,
        status: 'assigned',
        assignedAt: new Date()
      }, { transaction: t });
    }

    if (assignedTask) {
      await upsertDeliveryChargeForTask({
        DeliveryCharge,
        transaction: t,
        order,
        task: assignedTask,
        deliveryFee: finalFee,
        agentSharePercent: currentShare,
        deliveryType: dType,
        deliveryAgentId
      });

      await invoiceSellerChargeImmediately({
        DeliveryCharge,
        Wallet,
        Transaction,
        transaction: t,
        task: assignedTask,
        order
      });

      await DeliveryTask.update(
        {
          status: 'rejected',
          rejectionReason: 'Auto-closed: order assigned to another agent.'
        },
        {
          where: {
            orderId: order.id,
            id: { [Op.ne]: assignedTask.id },
            status: 'requested'
          },
          transaction: t
        }
      );
    }

    // New: Credit pending earnings to agent's wallet
    if (agentEarnings > 0 && needsCredit) {
      await creditPending(
        deliveryAgentId,
        agentEarnings,
        `Delivery Earning for Order #${order.orderNumber} (${dType})`,
        order.id,
        t,
        'delivery_agent'
      );
    }

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status: 'assigned',
      message: `Delivery agent assigned: ${deliveryAgentId}`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) }, { transaction: t });

    await t.commit();

    // Fetch full updated order with all includes
    const updatedOrder = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'OrderItems' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessPhone', 'businessName'] },
        {
          model: DeliveryTask,
          as: 'deliveryTasks',
          include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessPhone', 'businessName'] }]
        },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] }
      ]
    });

    // Notify agent
    const { notifyDeliveryAgentAssignment } = require('../utils/notificationHelpers');
    const { getIO } = require('../realtime/socket');
    const agent = await User.findByPk(deliveryAgentId);
    if (agent && updatedOrder) {
      await notifyDeliveryAgentAssignment(agent, updatedOrder, updatedOrder.orderNumber, dType);
    }

    // Real-time Update for Seller and Customer
    getIO().emit('orderStatusUpdate', {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      orderNumber: updatedOrder.orderNumber,
      warehouseId: updatedOrder.warehouseId,
      destinationWarehouseId: updatedOrder.destinationWarehouseId,
      pickupStationId: updatedOrder.pickupStationId,
      destinationPickStationId: updatedOrder.destinationPickStationId,
      adminRoutingStrategy: updatedOrder.adminRoutingStrategy,
      shippingType: updatedOrder.shippingType,
      deliveryType: dType,
      updatedAt: updatedOrder.updatedAt
    });

    res.json({
      success: true,
      message: 'Delivery agent assigned successfully',
      order: updatedOrder
    });
  } catch (error) {
    if (t && t.rollback) await t.rollback();
    console.error('Error in assignDeliveryAgent:', error);
    res.status(500).json({ error: 'Failed to assign delivery agent', details: error.message });
  }
};

const unassignDeliveryAgent = async (req, res) => {
  const userId = req.user.id;
  const { orderId } = req.params;

  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(orderId, { transaction: t });
    if (!order) {
      if (t) await t.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    if (['delivered', 'completed', 'cancelled'].includes(order.status)) {
      if (t) await t.rollback();
      return res.status(400).json({ error: `Cannot unassign agent from an order in status: ${order.status}` });
    }

    const { DeliveryTask, Op } = require('../models');
    const { revertPending } = require('../utils/walletHelpers');

    const activeTasks = await DeliveryTask.findAll({
      where: {
        orderId: order.id,
        status: { [Op.in]: ['assigned', 'accepted', 'arrived_at_pickup', 'in_progress'] }
      },
      transaction: t
    });

    for (const task of activeTasks) {
      if (task.deliveryAgentId) {
        const agentShare = parseFloat(task.agentShare) || 70;
        const potentialEarnings = (parseFloat(task.deliveryFee) || 0) * (agentShare / 100);
        if (potentialEarnings > 0) {
          await revertPending(task.deliveryAgentId, potentialEarnings, order.id, t);
        }
      }
      await task.update({
        status: 'cancelled',
        rejectionReason: 'Unassigned by Admin'
      }, { transaction: t });
    }

    await order.update({
      deliveryAgentId: null,
      deliveryType: null
    }, { transaction: t });

    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status: 'unassigned',
      message: `Delivery agent unassigned by admin: ${req.user.name || req.user.id}`,
      timestamp: new Date().toISOString(),
      updatedBy: userId
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) }, { transaction: t });

    await t.commit();

    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      activeTasks.forEach(task => {
        if (task.deliveryAgentId) {
          io.to(`user:${task.deliveryAgentId}`).emit('assignmentCancelled', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            message: 'You have been unassigned from this delivery task.'
          });
        }
      });
      io.to('admin').emit('orderStatusUpdate', { orderId: order.id, status: order.status, orderNumber: order.orderNumber });
    }

    res.json({ success: true, message: 'Delivery agent unassigned successfully', order: await Order.findByPk(order.id) });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Error in unassignDeliveryAgent:', error);
    res.status(500).json({ error: 'Failed to unassign delivery agent' });
  }
};

/**
 * PUBLIC order tracking by tracking number or order number (no auth required).
 * Exposes only safe, customer-facing fields.
 */
const publicTrackOrder = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    if (!trackingNumber) return res.status(400).json({ error: 'Tracking / order number is required' });

    const { Op } = require('sequelize');
    const include = [
      { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone', 'businessPhone'] },
      { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'lat', 'lng'] },
      { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'lat', 'lng'] }
    ];

    const order = await Order.findOne({
      where: {
        [Op.or]: [
          { trackingNumber },
          { orderNumber: trackingNumber },
          { checkoutOrderNumber: trackingNumber }
        ]
      },
      include
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) {}
    trackingUpdates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const agentPhone = order.deliveryAgent?.phone || order.deliveryAgent?.businessPhone || null;

    const payload = {
      orderNumber: order.orderNumber || order.checkoutOrderNumber,
      trackingNumber: order.trackingNumber,
      status: order.status,
      estimatedDelivery: order.estimatedDelivery || null,
      actualDelivery: order.actualDelivery || null,
      trackingUpdates,
      deliveryAgent: order.deliveryAgent ? {
        name: order.deliveryAgent.name,
        phone: agentPhone
      } : null,
      pickup: order.Warehouse ? {
        name: order.Warehouse.name,
        address: order.Warehouse.address,
        lat: order.Warehouse.lat,
        lng: order.Warehouse.lng
      } : null,
      destination: order.PickupStation ? {
        name: order.PickupStation.name,
        address: order.PickupStation.location,
        lat: order.PickupStation.lat,
        lng: order.PickupStation.lng
      } : {
        address: order.deliveryAddress || null
      }
    };

    return res.json(payload);
  } catch (error) {
    console.error('Error in publicTrackOrder:', error);
    return res.status(500).json({ error: 'Failed to get tracking info' });
  }
};

const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const isGroup = orderId && String(orderId).includes('group');
    let orders = [];

    const include = [
      { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessPhone', 'businessName'] },
      { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessLat', 'businessLng', 'businessTown', 'businessName'] },
      { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'lat', 'lng'] },
      { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'lat', 'lng'] }
    ];

    if (isGroup) {
      const gId = orderId.replace('group-', '');
      orders = await Order.findAll({
        where: {
          [Op.or]: [
            { checkoutGroupId: gId },
            { checkoutOrderNumber: gId }
          ]
        },
        include
      });
    } else {
      const id = parseInt(orderId, 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }
      const order = await Order.findByPk(id, { include });
      if (order) orders = [order];
    }

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const firstOrder = orders[0];
    const requester = req.user || {};
    const isAdminRole = ['admin', 'super_admin'].includes(String(requester.role || '').toLowerCase());

    // Authorization: allow owner, delivery agent, seller, or admins
    // For groups, we check if user owns/manages ANY of the orders
    const isAuthorized = orders.some(o => 
      requester.id === o.userId || 
      (requester.id && requester.id === o.deliveryAgentId) || 
      (requester.id && requester.id === o.sellerId) || 
      isAdminRole
    );

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Merge and sort tracking updates from all orders in the group
    let mergedUpdates = [];
    orders.forEach(o => {
      try {
        const updates = o.trackingUpdates ? JSON.parse(o.trackingUpdates) : [];
        if (Array.isArray(updates)) {
          mergedUpdates = [...mergedUpdates, ...updates];
        }
      } catch (_) { }
    });

    // Sort by timestamp descending
    mergedUpdates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Fetch live agent location from first order's active delivery task (proxy for group location)
    let agencyLocation = null;
    const activeOrder = orders.find(o => o.deliveryAgentId) || firstOrder;
    if (activeOrder.deliveryAgentId) {
      const activeTask = await DeliveryTask.findOne({
        where: {
          orderId: activeOrder.id,
          deliveryAgentId: activeOrder.deliveryAgentId,
          status: { [Op.notIn]: ['delivered', 'cancelled', 'failed'] }
        },
        order: [['createdAt', 'DESC']]
      });
      if (activeTask && activeTask.currentLocation) {
        try {
          agencyLocation = typeof activeTask.currentLocation === 'string'
            ? JSON.parse(activeTask.currentLocation)
            : activeTask.currentLocation;
        } catch (_) { }
      }
    }

    // Check for pending handover codes for ANY order in the group
    const handoverCode = await HandoverCode.findOne({
      where: {
        orderId: orders.map(o => o.id),
        handoverType: 'agent_to_customer',
        status: 'pending'
      }
    });

    const payload = {
      orderId: isGroup ? orderId : firstOrder.id,
      orderNumber: isGroup ? (firstOrder.checkoutOrderNumber || firstOrder.orderNumber) : firstOrder.orderNumber,
      status: firstOrder.status,
      handoverCode: !!handoverCode,
      trackingNumber: firstOrder.trackingNumber || null,
      estimatedDelivery: firstOrder.estimatedDelivery || null,
      actualDelivery: firstOrder.actualDelivery || null,
      deliveryNotes: firstOrder.deliveryNotes || null,
      deliveryAttempts: firstOrder.deliveryAttempts || 0,
      lastDeliveryAttempt: firstOrder.lastDeliveryAttempt || null,
      trackingUpdates: mergedUpdates,
      deliveryAgent: activeOrder.deliveryAgent ? {
        id: activeOrder.deliveryAgent.id,
        name: activeOrder.deliveryAgent.name,
        email: activeOrder.deliveryAgent.email,
        phone: activeOrder.deliveryAgent.phone || activeOrder.deliveryAgent.businessPhone,
        location: agencyLocation
      } : null,
      pickup: activeOrder.Warehouse ? {
        name: activeOrder.Warehouse.name,
        address: activeOrder.Warehouse.address,
        lat: activeOrder.Warehouse.lat,
        lng: activeOrder.Warehouse.lng
      } : (activeOrder.seller ? {
        name: activeOrder.seller.businessName,
        address: activeOrder.seller.businessAddress,
        lat: activeOrder.seller.businessLat,
        lng: activeOrder.seller.businessLng
      } : null),
      destination: activeOrder.PickupStation ? {
        name: activeOrder.PickupStation.name,
        address: activeOrder.PickupStation.location,
        lat: activeOrder.PickupStation.lat,
        lng: activeOrder.PickupStation.lng
      } : {
        lat: activeOrder.deliveryLat || null,
        lng: activeOrder.deliveryLng || null,
        address: activeOrder.deliveryAddress
      },
      pois: {
        warehouse: activeOrder.Warehouse,
        pickupStation: activeOrder.PickupStation
      }
    };

    return res.json(payload);
  } catch (error) {
    console.error('Error getting order tracking:', error);
    return res.status(500).json({ error: 'Failed to get order tracking' });
  }
};

const sellerUpdateStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, warehouseId, submissionDeadline, shippingType } = req.body;
    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: 'OrderItems', include: [{ model: Product, attributes: ['id', 'sellerId'] }, { model: FastFood, attributes: ['id', 'vendor'] }] }]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Check ownership: order.sellerId, or the seller owns products in the order
    let isSeller = order.sellerId === req.user.id;
    if (!isSeller && order.OrderItems) {
      isSeller = order.OrderItems.some(item =>
        (item.Product && item.Product.sellerId === req.user.id) ||
        (item.FastFood && item.FastFood.vendor === req.user.id)
      );
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ error: 'Not your order' });
    }

    const prevStatus = order.status;
    const routePolicy = resolveFastFoodRoutePolicy(order.OrderItems || []);

    if (routePolicy.isFastFoodOnlyOrder && FASTFOOD_DIRECT_DISALLOWED_STATUSES.has(status)) {
      return res.status(400).json({
        error: `Fast-food orders must follow a direct route (${FASTFOOD_DIRECT_DELIVERY_TYPE}) and cannot be moved to ${status}`
      });
    }

    // Idempotency guard: if already at requested status, succeed silently
    if (prevStatus === status) {
      return res.json({ message: 'Order status already set', order: { id: order.id, status: order.status } });
    }

    const nexts = ALLOWED_TRANSITIONS[prevStatus] || [];
    if (!nexts.includes(status)) {
      return res.status(400).json({ error: `Illegal transition from ${prevStatus} to ${status}` });
    }

    // Safety check: Lock dispatch (en_route_to_warehouse) until driver accepts OR seller provides dispatcher info
    if (status === 'en_route_to_warehouse') {
      const { dispatcherName, dispatcherContact } = req.body;
      const { DeliveryTask } = require('../models');
      const activeTask = await DeliveryTask.findOne({
        where: { orderId: order.id, status: { [Op.in]: ['accepted', 'in_progress', 'completed'] } }
      });

      // If no system driver accepted, we MUST have dispatcher info from the seller
      if (!activeTask && (!dispatcherName || !dispatcherContact)) {
        return res.status(400).json({ error: 'Cannot dispatch: Waiting for a delivery agent to accept the task OR provide dispatcher details.' });
      }
    }

    const updates = { status };
    if (notes) updates.deliveryNotes = notes;
    if (warehouseId) updates.warehouseId = warehouseId;
    if (submissionDeadline) updates.submissionDeadline = submissionDeadline;
    if (shippingType) updates.shippingType = shippingType;

    // Handle dispatcher details if provided
    if (req.body.dispatcherName) updates.selfDispatcherName = req.body.dispatcherName;
    if (req.body.dispatcherContact) updates.selfDispatcherContact = req.body.dispatcherContact;
    if (req.body.eta) updates.expectedWarehouseArrival = req.body.eta;

    if (status === 'seller_confirmed') {
      updates.sellerConfirmed = true;
      updates.sellerConfirmedAt = new Date();
      updates.sellerConfirmedBy = req.user.id;
      // NOTE: deliveryType is NOT set here — admin sets it during assignment.
    }

    await order.update(updates);

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status,
      message: notes || `Order status updated to ${status} by seller`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      io.to(`user:${order.userId}`).emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
      io.to('admin').emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
    }

    res.json({ success: true, message: 'Status updated', status, order });
  } catch (error) {
    console.error('Error in sellerUpdateStatus:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
};


const markReadyAtPickupStation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pickupStationId, notes } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const routePolicy = await getOrderRoutePolicy(order.id);
    if (routePolicy.isFastFoodOnlyOrder && order.adminRoutingStrategy !== 'fastfood_pickup_point') {
      return res.status(400).json({
        error: `Fast-food orders only support ${FASTFOOD_DIRECT_DELIVERY_TYPE} unless admin sets fastfood pickup point routing.`
      });
    }

    const status = 'ready_for_pickup';
    await order.update({
      status,
      pickupStationId: pickupStationId || order.pickupStationId
    });

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status,
      message: notes || 'Order is ready for pickup at the station',
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    const updatedOrder = await Order.findByPk(orderId);

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      const payload = { orderId: order.id, status, orderNumber: order.orderNumber };
      io.to(`user:${order.userId}`).emit('orderStatusUpdate', payload);
      if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', payload);
      io.to('admin').emit('orderStatusUpdate', payload);
    }

    res.json({ success: true, message: 'Order marked as ready for pickup at station', status, order: updatedOrder });
  } catch (error) {
    console.error('Error in markReadyAtPickupStation:', error);
    res.status(500).json({ success: false, error: 'Failed to mark as ready for pickup' });
  }
};

const confirmWarehouseArrival = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { itemsCondition, notes } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const routePolicy = await getOrderRoutePolicy(order.id);
    if (routePolicy.isFastFoodOnlyOrder) {
      return res.status(400).json({
        error: `Fast-food orders only support ${FASTFOOD_DIRECT_DELIVERY_TYPE} and cannot confirm warehouse arrival.`
      });
    }

    if (order.status === 'at_warehouse') {
      return res.json({ success: true, message: 'Order already confirmed at warehouse', status: order.status, order });
    }

    if (order.status !== 'en_route_to_warehouse') {
      return res.status(400).json({ error: `Cannot confirm arrival for order in status: ${order.status}` });
    }

    const status = 'at_warehouse';
    await order.update({
      status,
      warehouseArrivalDate: new Date(),
      deliveryAgentId: null // Reset for next leg assignment
    });

    // Mark any active delivery task for this order as completed
    const { DeliveryTask } = require('../models');
    await DeliveryTask.update(
      { status: 'completed', actualDeliveryDate: new Date() },
      { where: { orderId: order.id, status: ['accepted', 'in_progress'] } }
    );

    // Handle group consolidation check
    if (order.checkoutGroupId) {
      const { Op } = require('sequelize');
      const pendingSiblingsCount = await Order.count({
        where: {
          checkoutGroupId: order.checkoutGroupId,
          status: { [Op.notIn]: ['at_warehouse', 'at_warehouse', 'ready_for_pickup', 'in_transit', 'delivered', 'completed'] },
          id: { [Op.ne]: order.id }
        }
      });

      if (pendingSiblingsCount === 0) {
        console.log(`🎊 [confirmWarehouseArrival] Group ${order.checkoutGroupId} is now fully consolidated at warehouse!`);
        // We could update all members with a specific flag or note, 
        // but the fact that they all have status 'at_warehouse' is the key indicator for the UI.
      }
    }

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status,
      message: notes || `Dispatcher confirmed arrival at warehouse. Condition: ${itemsCondition || 'N/A'}`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      io.to(`user:${order.userId}`).emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
      if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
      io.to('admin').emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
    }

    res.json({ success: true, message: 'Arrival confirmed at warehouse', status, order });
  } catch (error) {
    console.error('Error in confirmWarehouseArrival:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm arrival' });
  }
};

const bulkUpdateOrderStatus = async (req, res) => {
  try {
    const { orderIds, status } = req.body;
    if (!Array.isArray(orderIds) || !status) {
      return res.status(400).json({ error: 'orderIds (array) and status are required' });
    }

    if (['at_warehouse', 'at_warehouse'].includes(status)) {
      return res.status(400).json({ error: 'Status "At Warehouse" must be confirmed via handover code entry.' });
    }

    await Order.update({ status }, { where: { id: { [Op.in]: orderIds } } });

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      const updatedOrders = await Order.findAll({ where: { id: { [Op.in]: orderIds } } });
      for (const o of updatedOrders) {
        io.to(`user:${o.userId}`).emit('orderStatusUpdate', { orderId: o.id, status, orderNumber: o.orderNumber });
        if (o.sellerId) io.to(`user:${o.sellerId}`).emit('orderStatusUpdate', { orderId: o.id, status, orderNumber: o.orderNumber });
        io.to('admin').emit('orderStatusUpdate', { orderId: o.id, status, orderNumber: o.orderNumber });
      }
    }

    res.json({ message: 'Orders updated successfully', count: orderIds.length });
  } catch (error) {
    console.error('Error in bulkUpdateOrderStatus:', error);
    res.status(500).json({ error: 'Failed to bulk update orders' });
  }
};

const bulkAssignDeliveryAgent = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderIds, password, deliveryAgentId, deliveryType, notes, deliveryFee, warehouseId, pickupStationId, pickupLocation, deliveryLocation } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      if (t) await t.rollback();
      return res.status(400).json({ error: 'orderIds (array) is required' });
    }

    if (!password) {
      if (t) await t.rollback();
      return res.status(400).json({ error: 'Password is required to bulk assign delivery agents' });
    }

    const adminUser = await User.findByPk(req.user.id, { transaction: t });
    const isPasswordValid = await bcrypt.compare(password, adminUser.password);
    if (!isPasswordValid) {
      if (t) await t.rollback();
      return res.status(401).json({ error: 'Incorrect admin password. Assignment denied.' });
    }

    const orders = await Order.findAll({
      where: { id: { [Op.in]: orderIds } },
      include: [
        { model: OrderItem, as: 'OrderItems' },
        { model: User, as: 'seller', attributes: ['id', 'name', 'businessAddress', 'businessCounty', 'businessTown', 'phone', 'email', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location'] },
        { model: FastFoodPickupPoint, as: 'DestinationFastFoodPickupPoint', attributes: ['id', 'name', 'address'] }
      ],
      transaction: t
    });

    const results = [];
    const { notifyDeliveryAgentAssignment } = require('../utils/notificationHelpers');
    const agent = await User.findByPk(deliveryAgentId, { transaction: t });

    // Enforcement: Bulk Check agent profile completeness
    const agentProfile = await DeliveryAgentProfile.findOne({ where: { userId: deliveryAgentId }, transaction: t });
    if (!agentProfile || !agentProfile.isActive) {
      if (t) await t.rollback();
      return res.status(400).json({ error: 'Cannot assign: Agent is currently OFFLINE or has no profile.' });
    }
    const { isComplete, missing } = checkProfileCompleteness(agentProfile, agent || {});
    if (!isComplete) {
      if (t) await t.rollback();
      return res.status(400).json({
        error: 'Cannot assign: Agent profile is incomplete.',
        missingFields: missing
      });
    }

    const shareConfig = await PlatformConfig.findOne({ where: { key: 'delivery_fee_agent_share' }, transaction: t });
    const currentShare = shareConfig ? parseFloat(shareConfig.value) : 70;
    const parsedBulkDeliveryFee =
      deliveryFee !== undefined && deliveryFee !== null && deliveryFee !== ''
        ? parseFloat(deliveryFee)
        : null;

    for (const order of orders) {
      const routePolicy = resolveFastFoodRoutePolicy(order.OrderItems || []);

      // Safety Checks
      const activeTask = await DeliveryTask.findOne({
        where: {
          orderId: order.id,
          status: { [Op.in]: ['accepted', 'in_progress', 'arrived_at_pickup'] }
        },
        transaction: t
      });

      if (activeTask || order.status === 'delivered') {
        results.push({ orderId: order.id, status: 'skipped', reason: activeTask ? 'Agent active' : 'Already delivered' });
        continue;
      }

      const fastFoodRoutingStrategy = order.adminRoutingStrategy || 'direct_delivery';
      const fastFoodExpectedDeliveryType = fastFoodRoutingStrategy === 'fastfood_pickup_point'
        ? FASTFOOD_PICKUP_POINT_DELIVERY_TYPE
        : FASTFOOD_DIRECT_DELIVERY_TYPE;

      if (routePolicy.isFastFoodOnlyOrder && fastFoodRoutingStrategy === 'direct_delivery' && FASTFOOD_DIRECT_DISALLOWED_STATUSES.has(order.status)) {
        results.push({ orderId: order.id, status: 'skipped', reason: `Fast-food order is in incompatible status: ${order.status}` });
        continue;
      }

      if (routePolicy.isFastFoodOnlyOrder && deliveryType && deliveryType !== fastFoodExpectedDeliveryType) {
        results.push({ orderId: order.id, status: 'skipped', reason: `Fast-food orders with strategy ${fastFoodRoutingStrategy} only support ${fastFoodExpectedDeliveryType}` });
        continue;
      }

      let dType = deliveryType || order.deliveryType;
      if (routePolicy.isFastFoodOnlyOrder) {
        dType = fastFoodExpectedDeliveryType;
      }
      if (!dType) {
        dType = FASTFOOD_DIRECT_DELIVERY_TYPE;
      }

      if (isWarehouseReentryAssignment(order.status, dType)) {
        results.push({
          orderId: order.id,
          status: 'skipped',
          reason: 'Order is already at warehouse. Next leg must be warehouse_to_customer or warehouse_to_pickup_station.'
        });
        continue;
      }

      // Update order
      const updates = {
        deliveryAgentId: deliveryAgentId,
        deliveryType: dType,
      };

      if (warehouseId) updates.warehouseId = warehouseId;
      if (pickupStationId) updates.pickupStationId = pickupStationId;
      if (['order_placed', 'returned', 'failed'].includes(order.status)) {
        updates.status = 'seller_confirmed';
      }

      // Delivery fee source of truth is order-level fee unless admin explicitly overrides.
      const finalFee = Number.isFinite(parsedBulkDeliveryFee)
        ? parsedBulkDeliveryFee
        : (parseFloat(order.deliveryFee) || 0);
      updates.deliveryFee = finalFee;

      // Special handling for warehouse arrival logic (if somehow triggered internally)
      if (['at_warehouse', 'at_warehouse'].includes(order.status || updates.status)) {
        updates.warehouseArrivalDate = new Date();
        updates.deliveryAgentId = null; // Reset for next leg assignment

        // Mark any active delivery task for this order as completed
        const { DeliveryTask } = require('../models');
        await DeliveryTask.update(
          { status: 'completed', actualDeliveryDate: new Date() },
          { where: { orderId: order.id, status: { [Op.in]: ['accepted', 'in_progress', 'arrived_at_pickup'] } } },
          { transaction: t }
        );
      }

      await order.update(updates, { transaction: t });

      // Derive locations dynamically for bulk

      const derivedPickup = (() => {
        if (pickupLocation && pickupLocation !== 'Seller Address' && pickupLocation !== 'Warehouse' && pickupLocation !== 'Station') return pickupLocation;

        if (['seller_to_warehouse', 'seller_to_customer', 'seller_to_pickup_station'].includes(dType)) {
          return order.seller?.businessAddress || order.seller?.businessTown || 'Seller Address';
        }
        if (['warehouse_to_customer', 'warehouse_to_seller', 'warehouse_to_pickup_station'].includes(dType) && order.Warehouse) {
          return `${order.Warehouse.name} - ${order.Warehouse.address}`;
        }
        if (['pickup_station_to_customer', 'pickup_station_to_warehouse'].includes(dType) && order.PickupStation) {
          return `${order.PickupStation.name} - ${order.PickupStation.location || order.PickupStation.address}`;
        }

        return 'Seller Address';
      })();

      const derivedDelivery = (() => {
        const targetWhId = warehouseId || order.warehouseId;
        const targetPsId = pickupStationId || order.destinationPickStationId || order.destinationFastFoodPickupPointId || order.pickupStationId;

        if (['seller_to_warehouse', 'customer_to_warehouse', 'pickup_station_to_warehouse'].includes(dType)) {
          if (targetWhId) {
            const wh = order.Warehouse;
            if (wh) return `${wh.name} - ${wh.address}`;
          }
        }
        if (['seller_to_pickup_station', 'warehouse_to_pickup_station', 'customer_to_pickup_station'].includes(dType)) {
          if (order.adminRoutingStrategy === 'fastfood_pickup_point' && targetPsId) {
            const fp = order.DestinationFastFoodPickupPoint;
            if (fp) return `${fp.name} - ${fp.address}`;
          }

          if (targetPsId) {
            const ps = order.PickupStation;
            if (ps) return `${ps.name} - ${ps.location || ps.address}`;
          }
        }
        return order.deliveryAddress;
      })();

      const taskData = {
        deliveryAgentId,
        deliveryType: dType,
        pickupLocation: derivedPickup,
        deliveryLocation: derivedDelivery,
        deliveryFee: finalFee || 0,
        agentShare: currentShare,
        status: 'assigned',
        assignedAt: new Date()
      };


      // Create/Update DeliveryTask
      const existingTask = await DeliveryTask.findOne({
        where: { orderId: order.id, status: { [Op.notIn]: ['completed', 'failed', 'cancelled'] } },
        transaction: t
      });

      // Calculate earnings from the selected task fee.
      const earnings = finalFee * (currentShare / 100);
      let needsCredit = true;
      let assignedTask = null;

      if (existingTask) {
        // Revert previous agent's pending if changing agent OR if fee changed for same agent
        if (existingTask.deliveryAgentId) {
          const oldShare = parseFloat(existingTask.agentShare) || 70;
          const oldEarnings = (parseFloat(existingTask.deliveryFee) || 0) * (oldShare / 100);

          if (existingTask.deliveryAgentId !== deliveryAgentId || Math.abs(oldEarnings - earnings) > 0.01) {
            await revertPending(existingTask.deliveryAgentId, oldEarnings, order.id, t);
          } else {
            needsCredit = false; // No change in agent or amount
          }
        }
        await existingTask.update(taskData, { transaction: t });
        assignedTask = existingTask;
      } else {
        assignedTask = await DeliveryTask.create({ ...taskData, orderId: order.id }, { transaction: t });
      }

      if (assignedTask) {
        await upsertDeliveryChargeForTask({
          DeliveryCharge,
          transaction: t,
          order,
          task: assignedTask,
          deliveryFee: finalFee,
          agentSharePercent: currentShare,
          deliveryType: dType,
          deliveryAgentId
        });

        await invoiceSellerChargeImmediately({
          DeliveryCharge,
          Wallet,
          Transaction,
          transaction: t,
          task: assignedTask,
          order
        });

        await DeliveryTask.update(
          {
            status: 'rejected',
            rejectionReason: 'Auto-closed: order assigned to another agent.'
          },
          {
            where: {
              orderId: order.id,
              id: { [Op.ne]: assignedTask.id },
              status: 'requested'
            },
            transaction: t
          }
        );
      }

      // New: Credit pending earnings to agent's wallet
      if (earnings > 0 && needsCredit) {
        await creditPending(
          deliveryAgentId,
          earnings,
          `Delivery Earning for Order #${order.orderNumber} (${dType})`,
          order.id,
          t,
          'delivery_agent'
        );
      }

      // Tracking
      let trackingUpdates = [];
      try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
      trackingUpdates.push({
        status: 'assigned',
        message: `Bulk delivery agent assigned: ${deliveryAgentId}`,
        timestamp: new Date().toISOString(),
        updatedBy: req.user.id
      });
      await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) }, { transaction: t });

      results.push({ orderId: order.id, status: 'success' });
    }

    await t.commit();

    // Trigger notifications asynchronously
    if (agent) {
      orders.forEach(o => {
        if (results.find(r => r.orderId === o.id && r.status === 'success')) {
          // Robust notification helper handles the full agent and order objects
          let currentLegType = deliveryType || o.deliveryType || 'seller_to_customer';
          notifyDeliveryAgentAssignment(agent, o, o.orderNumber, currentLegType).catch(err => console.error('Bulk Notify Error:', err));
        }
      });
    }

    res.json({ success: true, message: `Processed ${orders.length} orders`, results });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Error in bulkAssignDeliveryAgent:', error);
    res.status(500).json({ error: 'Failed to bulk assign delivery agent' });
  }
};


const bulkMarkReadyAtPickupStation = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderIds, pickupStationId, notes } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      if (t) await t.rollback();
      return res.status(400).json({ error: 'orderIds (array) is required' });
    }

    const status = 'ready_for_pickup';
    const { getIO } = require('../realtime/socket');
    const io = getIO();

    for (const orderId of orderIds) {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) continue;

      const routePolicy = await getOrderRoutePolicy(order.id, t);
      if (routePolicy.isFastFoodOnlyOrder) continue;

      await order.update({
        status,
        pickupStationId: pickupStationId || order.pickupStationId,
        // No arrival date field for stations yet, but we could add one if needed
      }, { transaction: t });

      let trackingUpdates = [];
      try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
      trackingUpdates.push({
        status,
        message: notes || 'Bulk: Order ready for pickup at station',
        timestamp: new Date().toISOString(),
        updatedBy: req.user.id
      });
      await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) }, { transaction: t });

      if (io) {
        io.to(`user:${order.userId}`).emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
        if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
        io.to('admin').emit('orderStatusUpdate', { orderId: order.id, status, orderNumber: order.orderNumber });
      }
    }

    await t.commit();
    res.json({ success: true, message: `Marked ${orderIds.length} orders as ready for pickup` });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Error in bulkMarkReadyAtPickupStation:', error);
    res.status(500).json({ error: 'Failed to bulk mark as ready for pickup' });
  }
};

const sellerConfirmOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { warehouseId, pickupStationId, submissionDeadline, shippingType, message: logMessage } = req.body;
    const { formatOrderSocketData, ORDER_SOCKET_INCLUDES } = require('../utils/orderHelpers');

    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: 'OrderItems', include: [{ model: Product, attributes: ['id', 'sellerId'] }, { model: FastFood, attributes: ['id', 'vendor'] }] }]
    });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Check ownership
    let isSeller = order.sellerId === req.user.id;
    if (!isSeller && order.OrderItems) {
      isSeller = order.OrderItems.some(item =>
        (item.Product && item.Product.sellerId === req.user.id) ||
        (item.FastFood && item.FastFood.vendor === req.user.id)
      );
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not your order' });
    }

    const routePolicy = resolveFastFoodRoutePolicy(order.OrderItems || []);

    const updates = {};

    // Idempotent: if already seller_confirmed, just update warehouse/deadline fields
    if (order.status === 'seller_confirmed') {
      if (routePolicy.isFastFoodOnlyOrder) {
        updates.warehouseId = null;
        updates.pickupStationId = null;
      } else {
        if (warehouseId) updates.warehouseId = warehouseId;
        if (pickupStationId) updates.pickupStationId = pickupStationId;
        if (submissionDeadline) updates.submissionDeadline = submissionDeadline;
        if (shippingType) updates.shippingType = shippingType;
      }
      if (Object.keys(updates).length > 0) await order.update(updates);
      return res.json({ success: true, message: 'Order already confirmed — details updated.', order });
    }

    // Standard confirmation from order_placed or super_admin_confirmed
    if (order.status !== 'order_placed' && order.status !== 'super_admin_confirmed') {
      return res.status(400).json({ success: false, error: `Cannot confirm order in status: ${order.status}` });
    }

    updates.status = 'seller_confirmed';
    updates.sellerConfirmed = true;
    updates.sellerConfirmedAt = new Date();
    updates.sellerConfirmedBy = req.user.id;

    if (routePolicy.isFastFoodOnlyOrder) {
      // Fast-food seller confirmation is direct seller -> customer.
      // Do not require or persist warehouse/pickup destination on seller confirm.
      updates.warehouseId = null;
      updates.pickupStationId = null;
    } else {
      if (warehouseId) {
        updates.warehouseId = warehouseId;
        updates.pickupStationId = null; // Mutually exclusive
      } else if (pickupStationId) {
        updates.pickupStationId = pickupStationId;
        updates.warehouseId = null; // Mutually exclusive
      }

      if (submissionDeadline) updates.submissionDeadline = submissionDeadline;
      if (shippingType) {
        updates.shippingType = shippingType;
        // NOTE: We intentionally do NOT set deliveryType here.
        // The shippingType (shipped_from_seller / collected_from_seller) is a seller logistics preference.
        // The actual delivery route leg (seller_to_warehouse, seller_to_customer, etc.) is determined
        // by the admin when they assign the delivery agent via the DeliveryAssignmentModal.
      }
    }

    await order.update(updates);

    // Notify customer
    try {
      await notifyCustomerSellerConfirmed(order, req.user);
    } catch (notifyErr) {
      console.warn('[sellerConfirmOrder] Notification failed:', notifyErr);
    }

    // Sync destination across group if this is the first one picking a destination
    if (!routePolicy.isFastFoodOnlyOrder && (warehouseId || pickupStationId) && order.checkoutGroupId) {
      console.log(`📦 [sellerConfirmOrder] Syncing destination (W: ${warehouseId}, P: ${pickupStationId}) for group ${order.checkoutGroupId}`);
      const siblingUpdates = {
        warehouseId: warehouseId || null,
        pickupStationId: pickupStationId || null,
        shippingType: shippingType || order.shippingType // Maintain consistency in logistics method too if possible
      };

      await Order.update(siblingUpdates, {
        where: {
          checkoutGroupId: order.checkoutGroupId,
          warehouseId: null,
          pickupStationId: null // Only update those that haven't picked one yet
        }
      });
    }

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    const isFastFood = routePolicy.isFastFoodOnlyOrder;
    const statusVal = isFastFood ? 'processing' : 'seller_confirmed';
    trackingUpdates.push({
      status: statusVal,
      message: logMessage || 'Order confirmed by seller',
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    const updatedOrder = await Order.findByPk(orderId, { include: ORDER_SOCKET_INCLUDES });

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      const updatePayload = formatOrderSocketData(updatedOrder);

      // Notify owner, seller, and admins
      io.to(`user:${order.userId}`).emit('orderStatusUpdate', updatePayload);
      if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderStatusUpdate', updatePayload);
      io.to('admin').emit('orderStatusUpdate', updatePayload);

      // Also notify siblings if they were synced
      if (order.checkoutGroupId) {
        const siblings = await Order.findAll({
          where: { checkoutGroupId: order.checkoutGroupId, id: { [Op.ne]: order.id } },
          include: ORDER_SOCKET_INCLUDES
        });

        for (const sib of siblings) {
          const sibPayload = formatOrderSocketData(sib);
          io.to(`user:${sib.userId}`).emit('orderStatusUpdate', sibPayload);
          if (sib.sellerId) io.to(`user:${sib.sellerId}`).emit('orderStatusUpdate', sibPayload);
          io.to('admin').emit('orderStatusUpdate', sibPayload);
        }
      }
    }

    res.json({ success: true, message: 'Order confirmed by seller.', order: updatedOrder });
  } catch (error) {
    console.error('Error in sellerConfirmOrder:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm order' });
  }
};

const sellerHandoverOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;

    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: 'OrderItems', include: [{ model: Product, attributes: ['id', 'sellerId'] }, { model: FastFood, attributes: ['id', 'vendor'] }] }]
    });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Check ownership
    let isSeller = order.sellerId === req.user.id;
    if (!isSeller && order.OrderItems) {
      isSeller = order.OrderItems.some(item =>
        (item.Product && item.Product.sellerId === req.user.id) ||
        (item.FastFood && item.FastFood.vendor === req.user.id)
      );
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isSeller && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not your order' });
    }

    if (order.sellerHandoverConfirmed) {
      return res.json({ success: true, message: 'Handover already confirmed.', order });
    }

    await order.update({
      sellerHandoverConfirmed: true,
      sellerHandoverConfirmedAt: new Date()
    });

    // Add tracking update
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status: order.status,
      message: notes || 'Seller confirmed handover to delivery agent',
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id,
      event: 'seller_handover'
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    const updatedOrder = await Order.findByPk(orderId);

    // Real-time status update via Socket.IO
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      io.to(`user:${order.userId}`).emit('orderUpdate', { orderId: order.id, event: 'seller_handover' });
      if (order.sellerId) io.to(`user:${order.sellerId}`).emit('orderUpdate', { orderId: order.id, event: 'seller_handover' });
      io.to('admin').emit('orderUpdate', { orderId: order.id, event: 'seller_handover' });
    }

    res.json({ success: true, message: 'Handover confirmed successfully.', order: updatedOrder });
  } catch (error) {
    console.error('Error in sellerHandoverOrder:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm handover' });
  }
};


const superAdminConfirmOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      message: logMessage,
      shippingType,
      adminRoutingStrategy,
      destinationWarehouseId,
      destinationPickStationId,
      destinationFastFoodPickupPointId,
      adminRoutingNotes
    } = req.body;

    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'OrderItems' }
      ]
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Import order helpers
    const {
      analyzeOrderComposition,
      validateRoutingSelection,
      getOrderSellerIds,
      formatOrderSocketData,
      ORDER_SOCKET_INCLUDES
    } = require('../utils/orderHelpers');

    // Analyze order composition
    const analysis = await analyzeOrderComposition(orderId);
    if (analysis.isMixedOrder) {
      return res.status(400).json({
        error: 'Mixed product and fastfood orders cannot be routed together',
        details: [analysis.routingBlockedReason]
      });
    }

    const effectiveRoutingStrategy = adminRoutingStrategy || analysis.defaultRoutingStrategy;

    // If routing strategy is provided, validate it
    if (effectiveRoutingStrategy) {
      const validation = await validateRoutingSelection(
        effectiveRoutingStrategy,
        order,
        destinationWarehouseId,
        destinationPickStationId,
        destinationFastFoodPickupPointId
      );

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid routing selection',
          details: validation.errors
        });
      }
    }

    const updates = {
      status: 'super_admin_confirmed',
      superAdminConfirmed: true,
      superAdminConfirmedAt: new Date(),
      superAdminConfirmedBy: req.user.id,
      isMultiSellerOrder: analysis.isMultiSeller
    };

    if (shippingType) updates.shippingType = shippingType;

    // Add routing fields and sync deliveryType if provided
    if (effectiveRoutingStrategy) {
      updates.adminRoutingStrategy = effectiveRoutingStrategy;

      // Ensure deliveryType is synced with the routing strategy's first leg
      if (effectiveRoutingStrategy === 'warehouse') {
        updates.deliveryType = 'seller_to_warehouse';
        if (destinationWarehouseId) {
          updates.destinationWarehouseId = destinationWarehouseId;
          updates.destinationPickStationId = null;
          updates.destinationFastFoodPickupPointId = null;
        }
      } else if (effectiveRoutingStrategy === 'pick_station') {
        updates.deliveryType = 'seller_to_pickup_station';
        if (destinationPickStationId) {
          updates.destinationPickStationId = destinationPickStationId;
          updates.destinationWarehouseId = null;
          updates.destinationFastFoodPickupPointId = null;
        }
      } else if (effectiveRoutingStrategy === 'fastfood_pickup_point') {
        updates.deliveryType = 'seller_to_pickup_station'; // Fastfood moves to pickup station first
        if (destinationFastFoodPickupPointId) {
          updates.destinationFastFoodPickupPointId = destinationFastFoodPickupPointId;
          updates.destinationWarehouseId = null;
          updates.destinationPickStationId = null;
        }
      } else if (effectiveRoutingStrategy === 'direct_delivery') {
        updates.deliveryType = 'seller_to_customer';
        updates.destinationWarehouseId = null;
        updates.destinationPickStationId = null;
        updates.destinationFastFoodPickupPointId = null;
      }

      if (adminRoutingNotes) {
        updates.adminRoutingNotes = adminRoutingNotes;
      }
    }

    // Handle communication log
    if (logMessage) {
      let logs = [];
      try {
        logs = order.communicationLog ? (typeof order.communicationLog === 'string' ? JSON.parse(order.communicationLog) : order.communicationLog) : [];
      } catch (e) { logs = []; }
      logs.push({
        sender: 'admin',
        senderName: req.user.name || 'Super Admin',
        message: logMessage,
        timestamp: new Date().toISOString()
      });
      updates.communicationLog = logs;
    }

    await order.update(updates);

    // Reload order with associations for response
    const updatedOrder = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'OrderItems' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'businessName'] },
        ...ORDER_SOCKET_INCLUDES
      ]
    });

    // Real-time status update via Socket.IO - notify ALL sellers involved
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io) {
      const sellerIds = await getOrderSellerIds(orderId);
      const socketPayload = formatOrderSocketData(updatedOrder);

      // Notify customer
      io.to(`user:${updatedOrder.userId}`).emit('orderStatusUpdate', socketPayload);

      // Notify all sellers
      sellerIds.forEach(sellerId => {
        io.to(`user:${sellerId}`).emit('orderStatusUpdate', socketPayload);
      });

      // Notify admin room
      io.to('admin').emit('orderStatusUpdate', socketPayload);
    }

    res.json({
      success: true,
      message: 'Order confirmed by Super Admin',
      order: updatedOrder,
      routing: {
        strategy: updatedOrder.adminRoutingStrategy,
        isSingleSeller: analysis.isSingleSeller,
        isMultiSeller: analysis.isMultiSeller,
        sellerCount: analysis.sellerCount,
        directDeliveryEligible: analysis.directDeliveryEligible,
        allowedRoutingStrategies: analysis.allowedRoutingStrategies
      }
    });
  } catch (error) {
    console.error('Error in superAdminConfirmOrder:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
};

const sendOrderMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    let { message, recipientId } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Auto-detect recipient if admin is sending and no recipientId is provided
    if (!recipientId && (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'superadmin')) {
      recipientId = order.sellerId;
      console.log(`[Messaging] Admin message detected, auto-routing to seller: ${recipientId}`);
    }

    let communicationLog = [];
    try {
      communicationLog = order.communicationLog ? (typeof order.communicationLog === 'string' ? JSON.parse(order.communicationLog) : order.communicationLog) : [];
      if (!Array.isArray(communicationLog)) communicationLog = [];
    } catch (_) {
      communicationLog = [];
    }

    const newMessage = {
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      message,
      timestamp: new Date().toISOString(),
      sender: (req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'superadmin') ? 'admin' : (req.user.id === order.sellerId ? 'seller' : 'other')
    };

    communicationLog.push(newMessage);
    await order.update({ communicationLog });

    // Real-time notification
    const { getIO } = require('../realtime/socket');
    const io = getIO();
    if (io && recipientId) {
      console.log(`[io] Emitting orderMessage to user_${recipientId}`);
      io.to(`user_${recipientId}`).emit('orderMessage', {
        orderId: order.id,
        message: newMessage.message,
        sender: newMessage.senderRole,
        timestamp: newMessage.timestamp
      });
    }

    res.json({ success: true, message: 'Message sent successfully', newMessage, log: communicationLog });
  } catch (error) {
    console.error('Error sending order message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

const getOrderCommunication = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let communicationLog = [];
    try {
      communicationLog = order.communicationLog ? (typeof order.communicationLog === 'string' ? JSON.parse(order.communicationLog) : order.communicationLog) : [];
      if (!Array.isArray(communicationLog)) communicationLog = [];
    } catch (_) {
      communicationLog = [];
    }

    res.json(communicationLog);
  } catch (error) {
    console.error('Error fetching order communication:', error);
    res.status(500).json({ error: 'Failed to fetch communication' });
  }
};

// Admin: Initiate refund for an order
const initiateRefund = async (req, res) => {
  const { orderId } = req.params;
  const { amount, reason, refundMethod } = req.body;

  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: User, as: 'user' }]
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.paymentConfirmed) {
      return res.status(400).json({ error: 'Cannot refund unpaid order' });
    }

    // Create refund record (simplified - in production would use a Refund model)
    const refund = {
      id: Date.now(),
      orderId: order.id,
      amount: amount || order.total,
      reason: reason || 'Admin initiated refund',
      refundMethod: refundMethod || 'original_payment_method',
      status: 'initiated',
      initiatedBy: req.user.id,
      initiatedAt: new Date(),
      customerId: order.userId
    };

    // In production, save to database
    // For now, we'll just return success

    res.json({
      message: 'Refund initiated successfully',
      refund
    });
  } catch (error) {
    console.error('Error initiating refund:', error);
    res.status(500).json({ error: 'Failed to initiate refund' });
  }
};

// Admin: Process refund
const processRefund = async (req, res) => {
  const { orderId, refundId } = req.params;
  const { status, transactionId } = req.body;

  try {
    // In production, update refund record in database
    res.json({
      message: 'Refund processed successfully',
      refundId,
      status,
      transactionId
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
};

// Admin: List all refunds
const listRefunds = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  try {
    // In production, query Refund model
    // For now, return mock data
    const refunds = [
      {
        id: 1,
        orderId: 123,
        orderNumber: 'ORD-123456',
        amount: 2500,
        reason: 'Customer request',
        status: 'completed',
        refundMethod: 'mpesa',
        customerName: 'John Doe',
        initiatedAt: new Date().toISOString(),
        processedAt: new Date().toISOString()
      }
    ];

    res.json({
      refunds,
      total: refunds.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing refunds:', error);
    res.status(500).json({ error: 'Failed to list refunds' });
  }
};

// Admin: Update refund status
const updateRefundStatus = async (req, res) => {
  const { refundId } = req.params;
  const { status, notes } = req.body;

  try {
    // In production, update refund record
    res.json({
      message: 'Refund status updated',
      refundId,
      status,
      notes
    });
  } catch (error) {
    console.error('Error updating refund status:', error);
    res.status(500).json({ error: 'Failed to update refund status' });
  }
};

// Admin: Create dispute for an order
const createDispute = async (req, res) => {
  const { orderId } = req.params;
  const { type, description, evidence } = req.body;

  try {
    const order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Create dispute record (simplified)
    const dispute = {
      id: Date.now(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: type || 'general',
      description,
      evidence,
      status: 'open',
      createdBy: req.user.id,
      createdAt: new Date(),
      customerId: order.userId,
      sellerId: order.sellerId
    };

    // In production, save to database

    res.json({
      message: 'Dispute created successfully',
      dispute
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ error: 'Failed to create dispute' });
  }
};

// Admin: Update dispute status
const updateDisputeStatus = async (req, res) => {
  const { disputeId } = req.params;
  const { status, resolution, notes } = req.body;

  try {
    // In production, update dispute record
    res.json({
      message: 'Dispute status updated',
      disputeId,
      status,
      resolution,
      notes
    });
  } catch (error) {
    console.error('Error updating dispute status:', error);
    res.status(500).json({ error: 'Failed to update dispute status' });
  }
};

// Admin: List all disputes
const listDisputes = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  try {
    // In production, query Dispute model
    // For now, return mock data
    const disputes = [
      {
        id: 1,
        orderId: 123,
        orderNumber: 'ORD-123456',
        type: 'product_quality',
        description: 'Product arrived damaged',
        status: 'open',
        customerName: 'John Doe',
        sellerName: 'Jane Seller',
        createdAt: new Date().toISOString()
      }
    ];

    res.json({
      disputes,
      total: disputes.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing disputes:', error);
    res.status(500).json({ error: 'Failed to list disputes' });
  }
};

// Admin: Get order analytics
const getOrderAnalytics = async (req, res) => {
  const { range = '30d', startDate, endDate } = req.query;

  try {
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          [Op.gte]: new Date(startDate),
          [Op.lte]: new Date(endDate)
        }
      };
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter = {
        createdAt: { [Op.gte]: thirtyDaysAgo }
      };
    }

    const orders = await Order.findAll({
      where: dateFilter,
      include: [
        { model: OrderItem, as: 'OrderItems' },
        { model: User, as: 'user' },
        { model: User, as: 'seller' },
        { model: User, as: 'deliveryAgent' }
      ]
    });

    // Calculate analytics
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Status distribution
    const statusCounts = {};
    orders.forEach(order => {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    });

    // Payment method distribution
    const paymentMethodCounts = {};
    orders.forEach(order => {
      const method = order.paymentMethod || 'unknown';
      paymentMethodCounts[method] = (paymentMethodCounts[method] || 0) + 1;
    });

    // Top products
    const productSales = {};
    orders.forEach(order => {
      order.OrderItems?.forEach(item => {
        const key = item.name;
        if (!productSales[key]) {
          productSales[key] = { totalSold: 0, totalRevenue: 0 };
        }
        productSales[key].totalSold += item.quantity || 0;
        productSales[key].totalRevenue += item.total || 0;
      });
    });

    const topProducts = Object.entries(productSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    // Delivery performance
    const deliveredOrders = orders.filter(o => o.status === 'delivered');
    const onTimeDeliveries = deliveredOrders.filter(o => {
      if (!o.estimatedDelivery || !o.actualDelivery) return false;
      return new Date(o.actualDelivery) <= new Date(o.estimatedDelivery);
    });

    const onTimeDeliveryRate = deliveredOrders.length > 0
      ? (onTimeDeliveries.length / deliveredOrders.length) * 100
      : 0;

    // Cancellation rate
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');
    const cancellationRate = totalOrders > 0 ? (cancelledOrders.length / totalOrders) * 100 : 0;

    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      statusDistribution: statusCounts,
      paymentMethodDistribution: paymentMethodCounts,
      topProducts,
      deliveryPerformance: {
        totalDelivered: deliveredOrders.length,
        onTimeDeliveries: onTimeDeliveries.length,
        onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 100) / 100
      },
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      period: { startDate, endDate, range }
    });
  } catch (error) {
    console.error('Error getting order analytics:', error);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
};

// Final consolidated exports
// Fill in missing handlers referenced by exports
const cancelOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { orderId } = req.params;
    const { reason, cancelledBy } = req.body;
    const isGroup = orderId.startsWith('group-');
    const groupId = isGroup ? orderId.replace('group-', '') : null;

    let orders = [];
    if (isGroup) {
      orders = await Order.findAll({
        where: { checkoutGroupId: groupId },
        include: [{ model: OrderItem, as: 'OrderItems', include: [{ model: Product, as: 'Product' }, { model: FastFood, as: 'FastFood' }] }]
      });
    } else {
      const order = await Order.findByPk(orderId, {
        include: [{ model: OrderItem, as: 'OrderItems', include: [{ model: Product, as: 'Product' }, { model: FastFood, as: 'FastFood' }] }]
      });
      if (order) orders = [order];
    }

    if (orders.length === 0) {
      await t.rollback();
      return res.status(404).json({ error: 'Order(s) not found' });
    }

    // Authorization & Validation
    for (const order of orders) {
      if (order.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden: You do not own this order' });
      }

      const terminalStatuses = ['delivered', 'completed', 'cancelled', 'failed', 'returned'];
      if (terminalStatuses.includes(order.status)) {
        await t.rollback();
        return res.status(400).json({ error: `Order ${order.orderNumber} is already ${order.status}` });
      }

      const inTransitStatuses = ['in_transit', 'in_transit', 'shipped', 'transit', 'ready_for_pickup'];
      if (inTransitStatuses.includes(order.status)) {
        await t.rollback();
        return res.status(400).json({ error: `Cannot cancel order ${order.orderNumber} while it is ${order.status}` });
      }

      // Fast Food Constraint: Cannot cancel after seller confirmation
      const hasFastFood = order.OrderItems?.some(item => item.itemType === 'fastfood' || item.fastFoodId);
      if (hasFastFood && ['seller_confirmed', 'super_admin_confirmed', 'processing'].includes(order.status)) {
        await t.rollback();
        return res.status(400).json({ error: `Fast food order ${order.orderNumber} cannot be cancelled once preparation has started.` });
      }

      // Time-window enforcement (customers only; admins bypass)
      if (req.user.role === 'customer') {
        const orderAge = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60); // minutes
        if (hasFastFood) {
          if (orderAge > FOOD_ORDER_CANCEL_WINDOW_MINUTES) {
            await t.rollback();
            return res.status(400).json({ error: `Food order ${order.orderNumber} can only be cancelled within ${FOOD_ORDER_CANCEL_WINDOW_MINUTES} minutes of placing it.` });
          }
        } else {
          const orderAgeHours = orderAge / 60;
          if (orderAgeHours > PRODUCT_ORDER_CANCEL_WINDOW_HOURS) {
            await t.rollback();
            return res.status(400).json({ error: `Order ${order.orderNumber} can only be cancelled within ${PRODUCT_ORDER_CANCEL_WINDOW_HOURS} hours of placing it.` });
          }
        }
      }
    }

    for (const order of orders) {
      const prevStatus = order.status;
      await order.update({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled by customer',
        cancelledBy: cancelledBy || (req.user.role === 'customer' ? 'customer' : 'admin'),
        deliveryAgentId: null // Crucial: clear agent if assigned so it leaves their active dashboard
      }, { transaction: t });

      // Add Tracking Update
      const existingTracking = parseMaybeJson(order.trackingUpdates, []);
      existingTracking.push({
        status: 'cancelled',
        location: 'System',
        description: `Order cancelled. Reason: ${reason || 'Not specified'}`,
        timestamp: new Date()
      });
      await order.update({ trackingUpdates: JSON.stringify(existingTracking) }, { transaction: t });

      // Restore Stock for Physical Products
      for (const item of order.OrderItems || []) {
        if (item.itemType === 'product' && item.productId) {
          const product = await Product.findByPk(item.productId, { transaction: t });
          if (product) {
            await product.update({ stock: product.stock + (item.quantity || 0) }, { transaction: t });
          }
        }
      }

      // Revert Seller Credits (Pending Wallet)
      const sellerPayout = Number(order.total || 0) - Number(order.deliveryFee || 0);
      if (sellerPayout > 0 && order.sellerId) {
        await revertPending(order.sellerId, sellerPayout, order.id, t);
      }

      // Revert Delivery Agent Credits if assigned
      const charges = await DeliveryCharge.findAll({ where: { orderId: order.id }, transaction: t });
      for (const charge of charges) {
        if (charge.payeeUserId && charge.agentAmount > 0) {
          await revertPending(charge.payeeUserId, charge.agentAmount, order.id, t);
        }
        await charge.update({ fundingStatus: 'reversed', note: `Reversed due to order cancellation: ${reason}` }, { transaction: t });
      }

      // Update Delivery Tasks
      await DeliveryTask.update(
        { status: 'cancelled', notes: `Cancelled: ${reason}` },
        { where: { orderId: order.id, status: { [Op.notIn]: ['delivered', 'completed', 'cancelled'] } }, transaction: t }
      );
    }

    // Update Payments if any
    const orderIds = orders.map(o => o.id);
    const payments = await Payment.findAll({
      where: {
        [Op.or]: [
          { orderId: { [Op.in]: orderIds } },
          isGroup ? { checkoutGroupId: groupId } : null
        ].filter(Boolean)
      },
      transaction: t
    });

    for (const payment of payments) {
      if (payment.status === 'completed') {
        await payment.update({
          status: 'refunded',
          refundAmount: payment.amount,
          refundReason: reason,
          refundedAt: new Date()
        }, { transaction: t });
      } else if (['pending', 'processing'].includes(payment.status)) {
        await payment.update({ status: 'cancelled' }, { transaction: t });
      }
    }

    await t.commit();

    // Notify customer after successful cancellation
    try {
      for (const order of orders) {
        // Reload order with user info for notification
        const fullOrder = await Order.findByPk(order.id, { include: [{ model: User, as: 'user' }] });
        if (fullOrder) {
          await notifyCustomerOrderCancelled(fullOrder, reason);
        }
      }
    } catch (notifyErr) {
      console.warn('[cancelOrder] Notification failed:', notifyErr.message);
    }
    
    res.json({ success: true, message: isGroup ? 'Checkout group cancelled successfully' : 'Order cancelled successfully' });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
};

const updateOrderAddress = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryAddress, addressDetails } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Authorization: owner or admin
    if (order.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only allow if not yet in transit
    const restricted = ['shipped', 'transit', 'delivered', 'cancelled'];
    if (restricted.includes(order.status)) {
      return res.status(400).json({ error: `Cannot update address when order is ${order.status}` });
    }

    await order.update({
      deliveryAddress: deliveryAddress || order.deliveryAddress,
      addressDetails: addressDetails || order.addressDetails,
      addressUpdatedAt: new Date(),
      addressUpdatedBy: req.user.role === 'admin' || req.user.role === 'super_admin' ? 'admin' : 'customer'
    });

    res.json({ message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error updating order address:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

const getOrderDetails = async (req, res) => {
  const { orderId } = req.params;
  try {
    let order;
    const include = [
        {
          model: OrderItem,
          as: 'OrderItems',
          include: [
            { model: User, as: 'seller', required: false, attributes: ['id', 'name', 'email', 'phone'] },
            {
              model: Product,
              required: false,
              attributes: ['id', 'name', 'coverImage', 'galleryImages', 'images', 'sellerId', 'basePrice', 'deliveryFee'],
              include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'businessName'] }]
            },
            {
              model: FastFood,
              required: false,
              attributes: ['id', 'name', 'mainImage', 'vendor', 'ingredients', 'allergens', 'basePrice', 'deliveryFee'],
              include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'businessName'] }]
            }
          ]
        },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone', 'lat', 'lng'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name', 'location', 'contactPhone', 'lat', 'lng'] },
        { model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessPhone', 'businessName'] },
        {
          model: DeliveryTask,
          as: 'deliveryTasks',
          required: false,
          include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'email', 'phone', 'businessPhone', 'businessName'] }]
        },
        { model: Batch, as: 'batch' }
    ];

    if (orderId && String(orderId).includes('group')) {
      const gId = orderId.replace('group-', '');

      const orders = await Order.findAll({
        where: {
          [Op.or]: [
            { checkoutGroupId: gId },
            { checkoutOrderNumber: gId }
          ]
        },
        include,
        order: [[{ model: DeliveryTask, as: 'deliveryTasks' }, 'createdAt', 'DESC']]
      });

      if (orders.length === 0) {
        console.warn(`[getOrderDetails] No orders found for group ID: ${gId}`);
        return res.status(404).json({ error: 'Order not found' });
      }

      // Build a unified "virtual" order object for the group
      const first = orders[0];
      // Include orderId on each OrderItem so the frontend can split returns per sub-order
      const items = orders.flatMap(o => {
        const plainOrder = o.get({ plain: true });
        return (plainOrder.OrderItems || []).map(item => ({ ...item, orderId: plainOrder.id }));
      });

      // Virtual order (plain object)
      order = {
        ...first.get({ plain: true }),
        id: orderId,
        orderNumber: first.checkoutOrderNumber || first.orderNumber,
        isGroup: true,
        subOrderIds: orders.map(o => o.id),
        OrderItems: items,
        total: orders.reduce((sum, o) => sum + Number(o.total || 0), 0),
        deliveryFee: orders.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0),
        status: orders.every(o => o.status === first.status) ? first.status : 'delivered'
      };
    } else {
      const dbOrder = await Order.findByPk(orderId, { 
        include,
        order: [[{ model: DeliveryTask, as: 'deliveryTasks' }, 'createdAt', 'DESC']]
      });
      if (!dbOrder) return res.status(404).json({ error: 'Order not found' });
      order = dbOrder.get({ plain: true });
    }

    // Ownership check
    const userRole = String(req.user.role || '').toLowerCase();
    const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(userRole);
    const isSeller = req.user.id === order.sellerId;
    const isCustomer = req.user.id === order.userId;
    const isAgent = req.user.id === order.deliveryAgentId;

    if (!isAdmin && !isSeller && !isCustomer && !isAgent) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? (typeof order.trackingUpdates === 'string' ? JSON.parse(order.trackingUpdates) : order.trackingUpdates) : []; } catch (_) { }
    let communicationLog = [];
    try { communicationLog = order.communicationLog ? (typeof order.communicationLog === 'string' ? JSON.parse(order.communicationLog) : order.communicationLog) : []; } catch (_) { }

    return res.json({ ...order, trackingUpdates, communicationLog });
  } catch (error) {
    console.error('[getOrderDetails] Error:', error.message, '\nStack:', error.stack);
    return res.status(500).json({ error: 'Failed to get order details', detail: error.message });
  }
};

// sellerUpdateStatus is defined above (line ~1256)
// Duplicate removed.
/*
  try {
    const { orderId } = req.params;
    const {
      status,
      notes,
      selfDispatcherName,
      selfDispatcherContact,
      expectedWarehouseArrival,
      dispatchNotes
    } = req.body;

    const order = await Order.findByPk(orderId, {
      include: [{
        model: OrderItem, as: 'OrderItems',
        include: [
          { model: Product, attributes: ['id', 'sellerId'] },
          { model: FastFood, attributes: ['id', 'vendor'] }
        ]
      }]
    });

    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Check seller ownership
    const isSeller = order.sellerId === req.user.id ||
      (order.OrderItems && order.OrderItems.some(item =>
        (item.Product && item.Product.sellerId === req.user.id) ||
        (item.FastFood && item.FastFood.vendor === req.user.id)
      ));
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isSeller && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this order' });
    }

    // Allowed statuses a seller/admin can set
    const SELLER_ALLOWED = ['ready_for_pickup', 'en_route_to_warehouse', 'seller_confirmed', 'processing'];
    if (!SELLER_ALLOWED.includes(status) && !isAdmin) {
      return res.status(400).json({ success: false, error: `Sellers cannot set status to: ${status}` });
    }

    const updates = { status };

    // Optional dispatch metadata (used when seller self-dispatches to warehouse)
    if (selfDispatcherName) updates.selfDispatcherName = selfDispatcherName;
    if (selfDispatcherContact) updates.selfDispatcherContact = selfDispatcherContact;
    if (expectedWarehouseArrival) updates.expectedWarehouseArrival = new Date(expectedWarehouseArrival);

    await order.update(updates);

    // Add a tracking entry
    let trackingUpdates = [];
    try { trackingUpdates = order.trackingUpdates ? JSON.parse(order.trackingUpdates) : []; } catch (_) { }
    trackingUpdates.push({
      status,
      message: notes || dispatchNotes || `Status updated to ${status} by seller`,
      timestamp: new Date().toISOString(),
      updatedBy: req.user.id
    });
    await order.update({ trackingUpdates: JSON.stringify(trackingUpdates) });

    // Real-time notification via Socket.IO
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
      console.warn('Socket error in sellerUpdateStatus:', socketErr.message);
    }

    // Notify customer
    try {
      const { createNotification } = require('../utils/notificationHelpers');
      const messages = {
        en_route_to_warehouse: 'Your order is on its way to our warehouse!',
        ready_for_pickup: 'Your order is ready for pickup!',
        processing: 'Your order is being processed.',
        seller_confirmed: 'Your order has been confirmed by the seller.'
      };
      await createNotification(
        order.userId,
        'Order Update',
        messages[status] || `Your order status is now: ${status}`,
        'info',
        order.id
      );
    } catch (notifErr) {
      console.warn('Notification error in sellerUpdateStatus:', notifErr.message);
    }

    return res.json({ success: true, message: `Order status updated to ${status}`, order: await Order.findByPk(orderId) });
  } catch (error) {
    console.error('Error in sellerUpdateStatus:', error);
    return res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
};

*/

const getOrderPayments = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { Payment } = require('../models');
    const payments = await Payment.findAll({
      where: { orderId },
      order: [['createdAt', 'DESC']]
    });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching order payments:', error);
    res.status(500).json({ error: 'Failed to fetch order payments' });
  }
};

// Get order composition analysis for admin routing decisions
const getOrderAnalysis = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { analyzeOrderComposition } = require('../utils/orderHelpers');

    const analysis = await analyzeOrderComposition(orderId);

    const strategyOptions = {
      warehouse: {
        id: 'warehouse',
        label: 'Warehouse Route',
        destinationType: 'warehouse',
        requiresDestination: true,
      },
      pick_station: {
        id: 'pick_station',
        label: 'Pick Station Route',
        destinationType: 'pickup_station',
        requiresDestination: true,
      },
      direct_delivery: {
        id: 'direct_delivery',
        label: 'Direct Delivery',
        destinationType: 'customer_address',
        requiresDestination: false,
      },
      fastfood_pickup_point: {
        id: 'fastfood_pickup_point',
        label: 'Fastfood Pickup Point',
        destinationType: 'fastfood_pickup_point',
        requiresDestination: true,
      },
    };

    res.json({
      success: true,
      analysis: {
        ...analysis,
        strategyOptions: analysis.allowedRoutingStrategies.map((key) => strategyOptions[key]).filter(Boolean),
      }
    });
  } catch (error) {
    console.error('Error in getOrderAnalysis:', error);
    res.status(500).json({ error: 'Failed to analyze order', details: error.message });
  }
};

const getOrdersByBatch = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: {
        batchId: { [Op.ne]: null }
      },
      include: [
        { model: Batch, as: 'batch' },
        { model: User, as: 'user', attributes: ['name', 'phone', 'businessName'] },
        { model: OrderItem, as: 'OrderItems' }
      ],
      order: [['batchId', 'DESC'], ['createdAt', 'DESC']]
    });

    // Group by batch
    const grouped = {};
    orders.forEach(order => {
      const bId = order.batchId;
      if (!grouped[bId]) {
        grouped[bId] = {
          batch: order.batch,
          orders: []
        };
      }
      grouped[bId].orders.push(order);
    });

    res.json({
      success: true,
      batches: Object.values(grouped)
    });
  } catch (error) {
    console.error('Error fetching orders by batch:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch batch orders' });
  }
};

module.exports = {
  createOrderFromCart,
  myOrders,
  getSuperAdminProductOrders,
  listAllOrders,
  updateOrderStatus,
  assignDeliveryAgent,
  unassignDeliveryAgent,
  cancelOrder,
  updateOrderAddress,
  addTrackingUpdate,
  getOrderTracking,
  publicTrackOrder,
  sellerConfirmOrder,
  superAdminConfirmOrder,
  sendOrderMessage,
  getOrderCommunication,
  ALLOWED_STATUSES,
  ALLOWED_TRANSITIONS,
  getOrderDetails,
  initiateRefund,
  processRefund,
  listRefunds,
  updateRefundStatus,
  createDispute,
  updateDisputeStatus,
  listDisputes,
  getOrderAnalytics,
  sellerUpdateStatus,
  markReadyAtPickupStation,
  bulkUpdateOrderStatus,
  bulkAssignDeliveryAgent,
  bulkMarkReadyAtPickupStation,
  sellerHandoverOrder,
  getOrderPayments,
  acquireOrderActionLock,
  releaseOrderActionLock,
  getOrderAnalysis,
  getOrdersByBatch
};
