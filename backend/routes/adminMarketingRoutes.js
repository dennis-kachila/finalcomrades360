const express = require('express');
const router = express.Router();
const { getPotentialRecipients, sendBulkThankYouMessages } = require('../controllers/adminMarketingNotificationController');
const { auth, adminOnly } = require('../middleware/auth');

/**
 * @route GET /api/admin/marketing/potential-recipients
 * @desc Get customers who received deliveries today
 * @access Admin
 */
router.get('/potential-recipients', auth, adminOnly, getPotentialRecipients);

/**
 * @route POST /api/admin/marketing/send-bulk-thank-you
 * @desc Send bulk thank you messages to delivered customers
 * @access Admin
 */
router.post('/send-bulk-thank-you', auth, adminOnly, sendBulkThankYouMessages);

module.exports = router;
