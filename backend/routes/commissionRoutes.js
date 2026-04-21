const express = require('express');
const { auth, adminOnly, requirePermission } = require('../middleware/auth');
const { getCommissionHistory, payCommission, getAllCommissions, bulkPayCommissions } = require('../controllers/commissionController');

const router = express.Router();

// Marketer: my commissions
router.get('/my', auth, getCommissionHistory);

// Admin: all commissions (filterable by status, marketer, date)
router.get('/', auth, adminOnly, getAllCommissions);

// Admin/Finance: bulk pay pending commissions (optionally scoped to one marketer)
router.post('/bulk-pay', auth, adminOnly, bulkPayCommissions);

// Finance: pay a single commission
router.post('/:commissionId/pay', auth, requirePermission('finance.manage'), payCommission);

module.exports = router;
