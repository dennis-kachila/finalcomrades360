const express = require('express');
const { createOrderFromCart, myOrders, getSuperAdminProductOrders, listAllOrders, updateOrderStatus, bulkUpdateOrderStatus, bulkAssignDeliveryAgent, bulkMarkReadyAtPickupStation, markReadyAtPickupStation, assignDeliveryAgent, unassignDeliveryAgent, cancelOrder, updateOrderAddress, addTrackingUpdate, getOrderTracking, publicTrackOrder, getOrderDetails, sellerConfirmOrder, superAdminConfirmOrder, sendOrderMessage, getOrderCommunication, sellerUpdateStatus, sellerHandoverOrder, getOrderPayments, acquireOrderActionLock, releaseOrderActionLock, getOrderAnalysis, getOrdersByBatch } = require('../controllers/orderController');
const { auth, adminOnly, requirePermission } = require('../middleware/auth');
const { transitionOrderStatus, getValidTransitions } = require('../controllers/orderTransitionController');
const { validate } = require('../middleware/validation');
const router = express.Router();

// Create order from cart (checkout)
router.post('/', auth, createOrderFromCart);

// Legacy checkout route
router.post('/checkout', auth, validate({
  deliveryAddress: require('joi').string().min(10).max(500).required(),
  paymentMethod: require('joi').string().valid('Cash on Delivery', 'M-Pesa', 'Card').default('Cash on Delivery')
}), createOrderFromCart);

// Legacy order creation (keeping for backward compatibility)
// Removed deprecated createOrder route

router.get('/my', auth, myOrders);

// Get orders for products added by super admin
router.get('/super-admin-products', auth, requirePermission('orders.view'), getSuperAdminProductOrders);

// Customer order cancellation
router.post('/:orderId/cancel', auth, cancelOrder);

// Customer address update for orders
router.patch('/:orderId/address', auth, updateOrderAddress);

// Public tracking (no auth required) – by tracking number or order number
router.get('/public-track/:trackingNumber', publicTrackOrder);

// Order tracking endpoints
router.get('/:orderId/tracking', auth, getOrderTracking);
router.post('/:orderId/tracking', auth, addTrackingUpdate);

// Get single order details
router.get('/:orderId', auth, getOrderDetails);
router.get('/:orderId/analysis', auth, requirePermission('orders.view'), getOrderAnalysis);
router.get('/:orderId/payments', auth, getOrderPayments);

// Delivery rating endpoint
const { rateDelivery } = require('../controllers/deliveryController');
router.post('/:orderId/rate-delivery', auth, rateDelivery);

// Seller confirmation workflow
router.post('/:orderId/seller-confirm', auth, sellerConfirmOrder);
router.post('/:orderId/seller-handover', auth, sellerHandoverOrder);
router.post('/:orderId/super-admin-confirm', auth, superAdminConfirmOrder);
router.patch('/:orderId/seller-status', auth, sellerUpdateStatus);


// Communication between seller and super admin
router.post('/:orderId/message', auth, sendOrderMessage);
router.get('/:orderId/communication', auth, getOrderCommunication);

// Admin endpoints
router.get('/', auth, requirePermission('orders.view'), listAllOrders);
router.patch('/bulk-status', auth, requirePermission('orders.updateStatus'), bulkUpdateOrderStatus);
router.patch('/bulk-assign', auth, requirePermission('orders.assign'), bulkAssignDeliveryAgent);
router.post('/bulk-ready-at-station', auth, requirePermission('orders.updateStatus'), bulkMarkReadyAtPickupStation);
router.patch('/:orderId/status', auth, requirePermission('orders.updateStatus'), updateOrderStatus);
router.patch('/:orderId/assign', auth, requirePermission('orders.assign'), assignDeliveryAgent);
router.patch('/:orderId/unassign', auth, requirePermission('orders.assign'), unassignDeliveryAgent);
router.post('/:orderId/lock', auth, acquireOrderActionLock);
router.post('/:orderId/unlock', auth, releaseOrderActionLock);
// Order routing lifecycle transitions
router.post('/:orderId/transition', auth, requirePermission('orders.updateStatus'), transitionOrderStatus);
router.get('/:orderId/valid-transitions', auth, requirePermission('orders.view'), getValidTransitions);

// Batch History (grouped orders)
router.get('/batch/history', auth, requirePermission('orders.view'), getOrdersByBatch);


module.exports = router;
