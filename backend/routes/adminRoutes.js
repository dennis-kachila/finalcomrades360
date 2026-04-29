const express = require('express');
const {
  getAllUsers,
  getPendingProducts,
  approveProduct,
  updateUserRole,
  setProductFlashSale,
  getAllProductsAdmin,
  notifySellerForProduct,
  deleteProduct,
  listDeletionRequests,
  approveDeletionRequest,
  denyDeletionRequest,
  rejectProduct,
  requestProductChanges,
  editAndApproveProduct,
  listCommissionsAdmin,
  bulkPayCommissions,
  bulkCancelCommissions,
  referralAnalytics,
  listMarketers,
  suspendMarketer,
  reactivateMarketer,
  suspendSeller,
  reactivateSeller,
  suspendDeliveryAgent,
  reactivateDeliveryAgent,
  suspendUserRoleGeneric,
  reactivateUserRoleGeneric,
  revokeReferralCode,
  assignReferralCode,
  updateProductCommissionRate,
  batchUpdateCategoryCommissionRate,
  getInventoryOverview,
  getInventoryItems,
  getLowStockAlerts,
  updateStockLevels,
  bulkUpdateStock,
  getProductAnalytics,
  getTopPerformingProducts,
  getProductPerformanceMetrics,
  getOrderAnalytics,
  bulkUpdateProducts,
  bulkUpdateCategories,
  bulkUpdatePrices,
  bulkUpdateStatus,
  getQualityMetrics,
  flagProductForReview,
  getFlaggedProducts,
  updateProductQualityScore,
  createCategoryPromotion,
  getPromotionAnalytics,
  manageFeaturedProducts,
  updateSearchPriority,
  getUserAnalytics,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  getSearchAnalytics,
  getRevenueAnalytics,
  verifyAdminPassword,
  getPlatformWalletDetails,
  withdrawPlatformFunds,
  getAdminCreatedItems
} = require('../controllers/adminController');

const { auth, adminOnly, adminOrLogistics, adminOrLogisticsOrSeller, adminOrFinance } = require('../middleware/auth');
const { 
  adminListDeliveryAgents, 
  getAvailableAgentsForOrder, 
  adminGetGlobalMapData,
  adminApproveRequest,
  adminRejectRequest,
  adminBulkApproveRequests,
  adminBulkRejectRequests,
  getAdminAgentDetail,
  getAdminAgentHistory,
  toggleAgentActiveStatus
} = require('../controllers/deliveryController');
const { getConfig, updateConfig } = require('../controllers/PlatformConfigController');
const adminHeroPromotionRoutes = require('./adminHeroPromotionRoutes');

const router = express.Router();

// Authentication is required for all routes
router.use(auth);

// Public / General Logistics access
router.get('/config/:key', adminOrLogistics, getConfig);
router.post('/config/:key', adminOnly, updateConfig);

// User management (Admin Only)
router.get('/users', adminOnly, getAllUsers);
router.post('/users', adminOnly, createUser);
router.patch('/users/:userId', adminOnly, updateUser);
router.delete('/users/:userId', adminOnly, deleteUser);
router.post('/users/:userId/restore', adminOnly, restoreUser);
router.get('/users/deletion-requests', adminOnly, listDeletionRequests);
router.post('/users/:userId/deletion-approve', adminOnly, approveDeletionRequest);
router.post('/users/:userId/deletion-deny', adminOnly, denyDeletionRequest);
router.patch('/users/:userId/role', adminOnly, updateUserRole);

// Product management (Admin Only)
router.get('/products/pending', adminOnly, getPendingProducts);
router.get('/products', adminOnly, getAllProductsAdmin);
router.patch('/products/:productId/approve', adminOnly, approveProduct);
router.patch('/products/:productId/reject', adminOnly, rejectProduct);
router.patch('/products/:productId/request-changes', adminOnly, requestProductChanges);
router.patch('/products/:productId/edit-approve', adminOnly, editAndApproveProduct);
router.get('/products/deletion-requests', adminOnly, listDeletionRequests);
router.post('/products/deletion-approve', adminOnly, approveDeletionRequest);
router.post('/products/deletion-deny', adminOnly, denyDeletionRequest);
router.delete('/products/:productId', adminOnly, deleteProduct);
router.patch('/products/:productId/flash-sale', adminOnly, setProductFlashSale);
router.post('/products/:productId/notify', adminOnly, notifySellerForProduct);

// Commission rate management
router.patch('/products/:productId/commission-rate', adminOnly, updateProductCommissionRate);
router.patch('/categories/:categoryId/commission-rate', adminOnly, batchUpdateCategoryCommissionRate);

// Commissions management
router.get('/commissions', adminOrFinance, listCommissionsAdmin);
router.post('/commissions/pay-bulk', adminOrFinance, bulkPayCommissions);
router.post('/commissions/cancel-bulk', adminOrFinance, bulkCancelCommissions);

// Referral analytics
router.get('/referrals/analytics', adminOrFinance, referralAnalytics);

// Marketer management
router.get('/marketers', adminOnly, listMarketers);
router.post('/marketers/:userId/suspend', adminOnly, suspendMarketer);
router.post('/marketers/:userId/reactivate', adminOnly, reactivateMarketer);
router.post('/marketers/:userId/referral/revoke', adminOnly, revokeReferralCode);
router.post('/marketers/:userId/referral/assign', adminOnly, assignReferralCode);

// Seller management
router.post('/sellers/:userId/suspend', adminOnly, suspendSeller);
router.post('/sellers/:userId/reactivate', adminOnly, reactivateSeller);

// Delivery agents management
router.get('/delivery/agents', adminOrLogistics, adminListDeliveryAgents);
router.get('/delivery/agents/available/:orderId', adminOrLogistics, getAvailableAgentsForOrder);
router.get('/delivery/agents/:agentId/detail', adminOrLogistics, getAdminAgentDetail);
router.get('/delivery/agents/:agentId/history', adminOrLogistics, getAdminAgentHistory);
router.patch('/delivery/agents/:agentId/toggle-status', adminOrLogistics, toggleAgentActiveStatus);
router.post('/delivery/agents/:userId/suspend', adminOnly, suspendDeliveryAgent);
router.post('/delivery/agents/:userId/reactivate', adminOnly, reactivateDeliveryAgent);
router.get('/delivery/global-map-data', adminOrLogistics, adminGetGlobalMapData);
router.post('/delivery/requests/bulk-approve', adminOrLogistics, adminBulkApproveRequests);
router.post('/delivery/requests/bulk-reject', adminOrLogistics, adminBulkRejectRequests);
router.post('/delivery/requests/:taskId/approve', adminOrLogistics, adminApproveRequest);
router.post('/delivery/requests/:taskId/reject', adminOrLogistics, adminRejectRequest);

// Generic role-based suspension
router.post('/users/:userId/roles/suspend', adminOnly, suspendUserRoleGeneric);
router.post('/users/:userId/roles/reactivate', adminOnly, reactivateUserRoleGeneric);

// User Analytics
router.get('/analytics/users', adminOnly, getUserAnalytics);

// Advanced inventory management
router.get('/inventory/overview', adminOrLogisticsOrSeller, getInventoryOverview);
router.get('/inventory/items', adminOrLogisticsOrSeller, getInventoryItems);
router.get('/inventory/on-behalf-items', adminOnly, getAdminCreatedItems);
router.get('/inventory/low-stock-alerts', adminOrLogisticsOrSeller, getLowStockAlerts);
router.patch('/products/:productId/stock', adminOrLogisticsOrSeller, updateStockLevels);
router.post('/inventory/bulk-update-stock', adminOrLogistics, bulkUpdateStock);

// Product analytics
router.get('/analytics/products', adminOnly, getProductAnalytics);
router.get('/analytics/top-products', adminOnly, getTopPerformingProducts);
router.get('/orders/analytics', adminOnly, getOrderAnalytics);
router.get('/products/:productId/performance', adminOnly, getProductPerformanceMetrics);

// Bulk operations
router.post('/products/bulk-update', adminOnly, bulkUpdateProducts);
router.post('/products/bulk-update-categories', adminOnly, bulkUpdateCategories);
router.post('/products/bulk-update-prices', adminOnly, bulkUpdatePrices);
router.post('/products/bulk-update-status', adminOnly, bulkUpdateStatus);

// Quality monitoring
router.get('/quality/metrics', adminOnly, getQualityMetrics);
router.post('/products/:productId/flag', adminOnly, flagProductForReview);
router.get('/products/flagged', adminOnly, getFlaggedProducts);
router.patch('/products/:productId/quality-score', adminOnly, updateProductQualityScore);

// Advanced promotions
router.use('/hero-promotions', adminHeroPromotionRoutes);
router.post('/promotions/category', adminOnly, createCategoryPromotion);
router.get('/promotions/analytics', adminOnly, getPromotionAnalytics);
router.patch('/products/:productId/featured', adminOnly, manageFeaturedProducts);

// Search and discovery
router.patch('/products/:productId/search-priority', adminOnly, updateSearchPriority);
router.get('/analytics/search', adminOnly, getSearchAnalytics);
router.get('/analytics/revenue', adminOrFinance, getRevenueAnalytics);
router.get('/finance/platform-wallet', adminOrFinance, getPlatformWalletDetails);
router.post('/finance/platform-wallet/withdraw', adminOnly, withdrawPlatformFunds); // Ensure adminOnly (we will check super_admin in controller)
router.post('/verify-password', adminOnly, verifyAdminPassword);

module.exports = router;
