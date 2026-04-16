const { DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => {

  const Order = sequelize.define("Order", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
    checkoutGroupId: { type: DataTypes.STRING, allowNull: true }, // Links multiple split orders from one checkout
    checkoutOrderNumber: { type: DataTypes.STRING, allowNull: true }, // Unified order number for the customer
    total: { type: DataTypes.FLOAT, defaultValue: 0 },
    status: { type: DataTypes.ENUM('order_placed', 'seller_confirmed', 'super_admin_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'en_route_to_pick_station', 'at_pick_station', 'awaiting_delivery_assignment', 'processing', 'ready_for_pickup', 'in_transit', 'delivered', 'completed', 'failed', 'cancelled', 'returned', 'return_in_progress'), defaultValue: "order_placed" },
    returnStatus: { type: DataTypes.ENUM('none', 'requested', 'approved', 'rejected', 'partially_returned', 'returned'), defaultValue: 'none' },
    paymentMethod: { type: DataTypes.STRING, allowNull: false },
    paymentType: { type: DataTypes.ENUM('cash_on_delivery', 'prepay'), allowNull: true },
    paymentSubType: { type: DataTypes.ENUM('cash', 'mpesa', 'bank_transfer', 'paypal', 'mpesa_prepay', 'airtel_money_prepay', 'bank_transfer_prepay', 'lipa_mdogo_mdogo'), allowNull: true },
    paymentConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    deliveryAgentId: { type: DataTypes.INTEGER, allowNull: true },
    primaryReferralCode: { type: DataTypes.STRING, allowNull: true, comment: 'Referral code entered at checkout (order-specific)' },
    secondaryReferralCode: { type: DataTypes.STRING, allowNull: true, comment: 'Referral code from user registration (User.referredByReferralCode)' },
    totalCommission: { type: DataTypes.FLOAT, defaultValue: 0 },
    deliveryFee: { type: DataTypes.FLOAT, defaultValue: 0 },
    deliveryAddress: { type: DataTypes.TEXT, allowNull: true },
    deliveryMethod: { type: DataTypes.STRING, allowNull: true },
    pickStation: { type: DataTypes.STRING, allowNull: true },
    addressDetails: { type: DataTypes.TEXT, allowNull: true },
    addressUpdatedAt: { type: DataTypes.DATE, allowNull: true },
    addressUpdatedBy: { type: DataTypes.ENUM('customer', 'admin'), allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelReason: { type: DataTypes.TEXT, allowNull: true },
    cancelledBy: { type: DataTypes.ENUM('customer', 'admin', 'system'), allowNull: true },
    // Order tracking fields
    trackingNumber: { type: DataTypes.STRING, allowNull: true },
    trackingUpdates: { type: DataTypes.TEXT, allowNull: true }, // JSON array of tracking updates
    estimatedDelivery: { type: DataTypes.DATE, allowNull: true },
    actualDelivery: { type: DataTypes.DATE, allowNull: true },
    deliveryNotes: { type: DataTypes.TEXT, allowNull: true },
    deliveryAttempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastDeliveryAttempt: { type: DataTypes.DATE, allowNull: true },
    paymentId: { type: DataTypes.STRING, allowNull: true }, // Reference to payment record for prepay orders
    items: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    paymentProofUrl: { type: DataTypes.STRING, allowNull: true, comment: 'URL to uploaded payment screenshot' },
    // New fields for seller and super admin confirmation
    sellerId: { type: DataTypes.INTEGER, allowNull: true }, // FK to User (seller)
    shippingType: { type: DataTypes.ENUM('shipped_from_seller', 'collected_from_seller'), allowNull: true },
    sellerConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    sellerConfirmedAt: { type: DataTypes.DATE, allowNull: true },
    sellerConfirmedBy: { type: DataTypes.INTEGER, allowNull: true }, // FK to User
    superAdminConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    superAdminConfirmedAt: { type: DataTypes.DATE, allowNull: true },
    superAdminConfirmedBy: { type: DataTypes.INTEGER, allowNull: true }, // FK to User
    warehouseArrivalDate: { type: DataTypes.DATE, allowNull: true },
    pickedUpAt: { type: DataTypes.DATE, allowNull: true, comment: 'When delivery agent confirmed collection/pickup' },
    communicationLog: { type: DataTypes.JSON, allowNull: true }, // JSON array of messages between seller and super admin
    isMarketingOrder: { type: DataTypes.BOOLEAN, defaultValue: false },
    customerName: { type: DataTypes.STRING, allowNull: true },
    customerPhone: { type: DataTypes.STRING, allowNull: true },
    customerEmail: { type: DataTypes.STRING, allowNull: true },
    marketingDeliveryAddress: { type: DataTypes.TEXT, allowNull: true },
    // New delivery type fields
    warehouseId: { type: DataTypes.INTEGER, allowNull: true, comment: 'Origin warehouse for warehouse_to_customer' },
    deliveryType: { type: DataTypes.ENUM('warehouse_to_customer', 'customer_to_warehouse', 'seller_to_customer', 'seller_to_warehouse', 'warehouse_to_seller', 'warehouse_to_pickup_station', 'seller_to_pickup_station', 'pickup_station_to_customer', 'pickup_station_to_warehouse'), defaultValue: null, allowNull: true, comment: 'Type of delivery route — null until admin specifies during assignment' },
    pickupLocation: { type: DataTypes.TEXT, allowNull: true, comment: 'Pickup address for customer_to_warehouse or seller_to_customer deliveries' },
    deliveryInstructions: { type: DataTypes.TEXT, allowNull: true, comment: 'Special instructions for delivery agent' },
    // Delivery rating fields
    deliveryRating: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 }, comment: 'Customer rating for delivery (1-5 stars)' },
    deliveryReview: { type: DataTypes.TEXT, allowNull: true, comment: 'Customer feedback for delivery' },
    deliveryRatedAt: { type: DataTypes.DATE, allowNull: true, comment: 'Timestamp when delivery was rated' },
    deliveryLat: { type: DataTypes.DECIMAL(10, 8), allowNull: true, comment: 'Latitude for customer delivery location' },
    deliveryLng: { type: DataTypes.DECIMAL(11, 8), allowNull: true, comment: 'Longitude for customer delivery location' },
    submissionDeadline: { type: DataTypes.DATE, allowNull: true, comment: 'Deadline for seller to drop off at warehouse' },
    pickupStationId: { type: DataTypes.INTEGER, allowNull: true, comment: 'FK to PickupStation' },
    // Dispatcher details (when seller handles logistics to warehouse)
    selfDispatcherName: { type: DataTypes.STRING, allowNull: true },
    selfDispatcherContact: { type: DataTypes.STRING, allowNull: true },
    expectedWarehouseArrival: { type: DataTypes.DATE, allowNull: true },
    sellerHandoverConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
    sellerHandoverConfirmedAt: { type: DataTypes.DATE, allowNull: true },
    marketerId: { type: DataTypes.INTEGER, allowNull: true, comment: 'FK to User (marketer) who placed the order' },
    // Synchronization fields
    processingBy: { type: DataTypes.INTEGER, allowNull: true, comment: 'User ID of admin/logistics manager currently editing' },
    processingAction: { type: DataTypes.STRING, allowNull: true, comment: 'Type of action being performed (e.g., assigning, auditing)' },
    processingTimeout: { type: DataTypes.DATE, allowNull: true, comment: 'When the current processing lock expires' },
    // Admin routing fields
    adminRoutingStrategy: { type: DataTypes.ENUM('warehouse', 'pick_station', 'direct_delivery', 'fastfood_pickup_point'), allowNull: true, comment: 'Admin-determined routing strategy for order fulfillment' },
    destinationWarehouseId: { type: DataTypes.INTEGER, allowNull: true, comment: 'Destination warehouse for seller deliveries (admin-specified)' },
    destinationPickStationId: { type: DataTypes.INTEGER, allowNull: true, comment: 'Destination pick station for seller deliveries (admin-specified)' },
    destinationFastFoodPickupPointId: { type: DataTypes.INTEGER, allowNull: true, comment: 'Destination fastfood pickup point for fastfood routing' },
    isMultiSellerOrder: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false, comment: 'Auto-calculated: true if order has items from multiple sellers' },
    adminRoutingNotes: { type: DataTypes.TEXT, allowNull: true, comment: 'Admin notes about routing decision (visible to sellers)' },
    totalBasePrice: { type: DataTypes.FLOAT, defaultValue: 0, comment: 'Cached sum of seller earnings (basePrice * quantity) for all internal items' },
    batchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Batches',
        key: 'id'
      }
    }
  }, {
    freezeTableName: true,  // disables automatic pluralization
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['sellerId'] },
      { fields: ['marketerId'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      { fields: ['checkoutOrderNumber'] },
      { fields: ['customerEmail'] },
      { fields: ['customerPhone'] }
    ]
  });

  // Define associations
  Order.associate = (models) => {
    // An order has many order items
    Order.hasMany(models.OrderItem, { foreignKey: 'orderId', as: 'OrderItems', onDelete: 'CASCADE', hooks: true });
    // The order belongs to the user who placed it
    Order.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    // The order may belong to a delivery agent user (aliased)
    Order.belongsTo(models.User, { foreignKey: 'deliveryAgentId', as: 'deliveryAgent' });
    // The order belongs to a seller (for confirmation workflow)
    Order.belongsTo(models.User, { foreignKey: 'sellerId', as: 'seller' });
    // The order may belong to a marketer
    Order.belongsTo(models.User, { foreignKey: 'marketerId', as: 'marketer' });
    // The order may have been confirmed by a seller user
    Order.belongsTo(models.User, { foreignKey: 'sellerConfirmedBy', as: 'sellerConfirmer' });
    // The order may have been confirmed by a super admin user
    Order.belongsTo(models.User, { foreignKey: 'superAdminConfirmedBy', as: 'superAdminConfirmer' });
    // An order has many commission records
    Order.hasMany(models.Commission, { foreignKey: 'orderId' });
    // An order has many delivery tasks
    Order.hasMany(models.DeliveryTask, { foreignKey: 'orderId', as: 'deliveryTasks' });
    // An order belongs to a warehouse
    Order.belongsTo(models.Warehouse, { foreignKey: 'warehouseId', as: 'Warehouse' });
    // An order belongs to a pickup station
    Order.belongsTo(models.PickupStation, { foreignKey: 'pickupStationId', as: 'PickupStation' });
    // Admin routing associations
    Order.belongsTo(models.Warehouse, { foreignKey: 'destinationWarehouseId', as: 'DestinationWarehouse' });
    Order.belongsTo(models.PickupStation, { foreignKey: 'destinationPickStationId', as: 'DestinationPickStation' });
    Order.belongsTo(models.FastFoodPickupPoint, { foreignKey: 'destinationFastFoodPickupPointId', as: 'DestinationFastFoodPickupPoint' });
    // An order has many transactions
    Order.hasMany(models.Transaction, { foreignKey: 'orderId', as: 'transactions' });

    Order.belongsTo(models.Batch, {
      foreignKey: 'batchId',
      as: 'batch'
    });
  };

  // Safety Sync: Ensure COD orders reach terminal 'delivered' status with payment confirmation
  Order.addHook('beforeSave', (order, options) => {
    if (order.changed('status') && order.status === 'delivered') {
      if (order.paymentType === 'cash_on_delivery' && !order.paymentConfirmed) {
        order.paymentConfirmed = true;
      }
    }
  });

  return Order;
};
