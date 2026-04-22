const express = require('express');
const { auth, checkRole } = require('../middleware/auth');
const { getShareUrl, redirectTracker, trackShare, myStats, lookupCustomer, getMarketerPublicDetails, getMyCustomers, getCustomerOrders } = require('../controllers/marketingController');
const { getMarketerWallet } = require('../controllers/marketerWalletController');
const { withdraw } = require('../controllers/walletController');
// const {
//   getCampaigns,
//   createCampaign,
//   updateCampaign,
//   deleteCampaign,
//   getPendingApprovals,
//   reviewCampaign
// } = require('../controllers/campaignController');

const router = express.Router();

// Campaign routes
// router.route('/campaigns')
//   .get(auth, checkRole(['marketer', 'admin']), getCampaigns)
//   .post(auth, checkRole('marketer'), createCampaign);

// router.route('/campaigns/:id')
//   .put(auth, checkRole('marketer'), updateCampaign)
//   .delete(auth, checkRole('marketer'), deleteCampaign);

// // Admin approval routes
// router.get('/campaigns/pending-approvals',
//   auth,
//   checkRole('admin'),
//   getPendingApprovals
// );

// router.put('/campaigns/:id/review',
//   auth,
//   checkRole('admin'),
//   reviewCampaign
// );

// Marketer-only: generate platform share URLs
router.get('/share-url/:productId', auth, checkRole('marketer'), getShareUrl);

// Public redirect tracker (clicks)
router.get('/r', redirectTracker);

// Marketer-only: record a share action
router.post('/track-share', auth, checkRole('marketer'), trackShare);

// Marketer-only: my aggregated stats
router.get('/stats/my', auth, checkRole('marketer'), myStats);

// Marketer-only: lookup customer by name or phone
router.get('/customer-lookup', auth, lookupCustomer);

// Public: get marketer details by referral code
router.get('/ref-details/:code', getMarketerPublicDetails);

// Wallet
router.get('/wallet', auth, checkRole('marketer'), getMarketerWallet);
router.post('/wallet/withdraw', auth, checkRole('marketer'), withdraw);

// Test route
router.get('/test-ok', (req, res) => res.json({ ok: true }));

// My Customers
router.get('/my-customers', auth, checkRole('marketer'), getMyCustomers);
router.get('/customers/:customerId/orders', auth, checkRole('marketer'), getCustomerOrders);

module.exports = router;
