const express = require('express');
const {
  getGeneralOverview,
  getHistoricalTrends,
  getRevenueForecast,
  getSellerPerformanceScores,
  getDeliveryEfficiencyMetrics,
  getMarketingCampaignROI,
  getGrowthPosterData
} = require('../controllers/analyticsController');
const { auth, adminOnly, adminOrFinance } = require('../middleware/auth');

const router = express.Router();

// All analytics routes require admin or finance authorization
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

module.exports = router;
