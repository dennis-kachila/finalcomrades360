const express = require('express');
const router = express.Router();
const {
    getAllFastFoods,
    getFastFoodById,
    createFastFood,
    updateFastFood,
    deleteFastFood,
    getVendorFastFoods,
    getDeletedFastFoods,
    restoreFastFood,
    permanentlyDeleteFastFood
} = require('../controllers/fastFoodController');

// Import authentication middleware if needed
const { auth: protect, authorize, optionalAuth, checkSellerProfile } = require('../middleware/auth');

const { uploadProductMedia } = require('../config/multer');
const { compressUploadedImages } = require('../utils/imageCompression');

// Configure upload middleware for fast food
const uploadFastFood = uploadProductMedia.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'galleryImages', maxCount: 5 }
]);

router.route('/')
    .get(optionalAuth, getAllFastFoods)
    .post(protect, checkSellerProfile, uploadFastFood, compressUploadedImages, createFastFood); // Add protect/authorize if needed

router.get('/vendor/me', protect, getVendorFastFoods);
router.get('/vendor/:vendorId', protect, getVendorFastFoods);

// --- RECYCLE BIN ROUTES ---
router.get('/deleted', protect, getDeletedFastFoods);
router.post('/restore/:id', protect, restoreFastFood);
router.delete('/permanent/:id', protect, permanentlyDeleteFastFood);

router.route('/:id')
    .get(optionalAuth, getFastFoodById)
    .put(protect, checkSellerProfile, uploadFastFood, compressUploadedImages, updateFastFood) // For full updates with files
    .patch(protect, updateFastFood) // For simple field updates (bulk operations) - NO file upload middleware
    .delete(protect, deleteFastFood); // Add protect/authorize if needed

// --- REVIEWS ---
const {
    createReview,
    getPublicReviews,
    getAllReviews,
    updateReviewStatus,
    deleteReview
} = require('../controllers/FastFoodReviewController');
// const { protect, authorize } = require('../middleware/auth'); // Removed duplicate

// Public: Get reviews for item
router.get('/reviews/item/:fastFoodId', getPublicReviews);

// Protected: Submit review
router.post('/reviews', protect, createReview);

// Admin: Manage Reviews
router.get('/reviews/admin/all', protect, authorize('admin', 'superadmin'), getAllReviews);
router.put('/reviews/admin/:id', protect, authorize('admin', 'superadmin'), updateReviewStatus);
router.delete('/reviews/admin/:id', protect, authorize('admin', 'superadmin'), deleteReview);


// --- PLATFORM CONFIG (HERO SETTINGS) ---
const { getConfig, updateConfig } = require('../controllers/PlatformConfigController');

// Public/Semi-protected: Get Hero Config
router.get('/config/:key', getConfig);

// Super Admin Only: Update Config
router.post('/config/:key', protect, authorize('superadmin'), updateConfig);


// --- PICKUP POINTS ---
const {
    getPickupPoints,
    getAdminPickupPoints,
    createPickupPoint,
    updatePickupPoint,
    deletePickupPoint
} = require('../controllers/fastFoodPickupPointController');

// Public: Get active pickup points
router.get('/pickup-points/list', getPickupPoints);

// Admin: Manage Pickup Points
router.get('/pickup-points/admin/all', protect, authorize('admin', 'superadmin'), getAdminPickupPoints);
router.post('/pickup-points', protect, authorize('admin', 'superadmin'), createPickupPoint);
router.put('/pickup-points/:id', protect, authorize('admin', 'superadmin'), updatePickupPoint);
router.delete('/pickup-points/:id', protect, authorize('admin', 'superadmin'), deletePickupPoint);


module.exports = router;
