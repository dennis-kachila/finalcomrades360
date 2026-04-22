const express = require('express');
const { auth, checkRole, checkSellerProfile } = require('../middleware/auth');
const { getMyOrders, getMyProducts, getMyProductById, updateMyProduct, duplicateCheck, getMyKpis, getOverview } = require('../controllers/sellerController');
const { getSellerWallet } = require('../controllers/sellerWalletController');
const { withdraw } = require('../controllers/walletController');
const { uploadProductMedia } = require('../config/multer');
const { compressUploadedImages } = require('../utils/imageCompression');

const router = express.Router()

// Seller-only routes - All require profile completeness
router.get('/overview', auth, checkRole('seller', 'admin'), checkSellerProfile, getOverview)
router.get('/products', auth, checkRole('seller', 'admin'), checkSellerProfile, getMyProducts)
router.get('/products/duplicate-check', auth, checkRole('seller', 'admin'), checkSellerProfile, duplicateCheck)
router.get('/products/:id', auth, checkRole('seller', 'admin'), checkSellerProfile, getMyProductById)
router.patch('/products/:id', auth, checkRole('seller', 'admin'), checkSellerProfile, uploadProductMedia.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'gallery', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]), compressUploadedImages, updateMyProduct)
router.get('/orders', auth, checkRole('seller', 'admin'), checkSellerProfile, getMyOrders)
// KPIs pre-aggregated
router.get('/kpis', auth, checkRole('seller', 'admin'), checkSellerProfile, getMyKpis)

// Wallet
router.get('/wallet', auth, checkRole('seller', 'admin'), checkSellerProfile, getSellerWallet)
router.post('/wallet/withdraw', auth, checkRole('seller', 'admin'), checkSellerProfile, withdraw)

module.exports = router;
