const express = require('express');
const router = express.Router();
const productInquiryController = require('../controllers/productInquiryController');
const { auth, adminOnly } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Customer routes
router.post('/', productInquiryController.createProductInquiry);
router.get('/my-inquiries', productInquiryController.getUserProductInquiries);
router.get('/:id', productInquiryController.getProductInquiryById);
router.delete('/:id', productInquiryController.deleteProductInquiry);

// Admin routes (require admin/super_admin role)
router.get('/admin/all', adminOnly, productInquiryController.getAllProductInquiries);

router.put('/admin/:id', adminOnly, productInquiryController.updateProductInquiry);

router.get('/admin/stats', adminOnly, productInquiryController.getInquiryStats);
router.post('/:id/reply', productInquiryController.addReply);

module.exports = router;