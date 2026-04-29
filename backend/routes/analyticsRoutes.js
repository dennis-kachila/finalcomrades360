const express = require('express');
console.error('🚀 ANALYTICS ROUTES LOADING...');
const {
  getGeneralOverview,
  getHistoricalTrends,
  getRevenueForecast,
  getSellerPerformanceScores,
  getDeliveryEfficiencyMetrics,
  getMarketingCampaignROI,
  getGrowthPosterData,
  logSiteVisit,
  getTrafficStats
} = require('../controllers/analyticsController');
const { auth, adminOnly, adminOrFinance } = require('../middleware/auth');

const router = express.Router();

// Public route to log visits
router.post('/log-visit', logSiteVisit);

// All other analytics routes require admin or finance authorization
router.use(auth);

// Overview stats - admin/finance only
router.get('/overview', adminOrFinance, getGeneralOverview);

// Historical trends - admin/finance only
router.get('/trends/historical', adminOrFinance, getHistoricalTrends);

// Revenue forecasting - admin/finance only
router.get('/revenue/forecast', adminOrFinance, getRevenueForecast);

// Seller performance scoring - admin only
router.get('/sellers/performance', adminOnly, getSellerPerformanceScores);

// Delivery efficiency metrics - admin only
router.get('/delivery/efficiency', adminOnly, getDeliveryEfficiencyMetrics);

// Marketing campaign ROI - admin/finance only
router.get('/marketing/roi', adminOrFinance, getMarketingCampaignROI);

// Growth poster data - admin/finance only
router.get('/growth-poster', adminOrFinance, getGrowthPosterData);

// Traffic stats - admin/finance only
router.get('/traffic/stats', adminOrFinance, getTrafficStats);

module.exports = router;
