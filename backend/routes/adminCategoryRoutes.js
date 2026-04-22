const express = require('express');
const { createCategory, createSubcategory, updateCategory, updateSubcategory, deleteCategory, deleteSubcategory } = require('../controllers/adminCategoryController');
const { auth: protect, adminOnly: admin } = require('../middleware/auth');

const router = express.Router();

// Debug ping route
router.get('/ping', (req, res) => res.json({ message: 'adminCategoryRoutes ping OK', originalUrl: req.originalUrl, url: req.url }));

// @route   POST /api/admin/categories
// @desc    Create a new category
// @access  Private/Admin
router.post('/', protect, admin, createCategory);

// @route   PUT /api/admin/categories/:id
// @desc    Update a category
// @access  Private/Admin
router.put('/:id', protect, admin, updateCategory);

// @route   DELETE /api/admin/categories/:id
// @desc    Delete a category
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteCategory);

// @route   POST /api/admin/categories/:categoryId/subcategories
// @desc    Create a new subcategory
// @access  Private/Admin
router.post('/:categoryId/subcategories', protect, admin, createSubcategory);

// @route   PUT /api/admin/categories/:categoryId/subcategories/:subcategoryId
// @desc    Update a subcategory
// @access  Private/Admin
router.put('/:categoryId/subcategories/:subcategoryId', protect, admin, updateSubcategory);

// @route   DELETE /api/admin/categories/:categoryId/subcategories/:subcategoryId
// @desc    Delete a subcategory
// @access  Private/Admin
router.delete('/:categoryId/subcategories/:subcategoryId', protect, admin, deleteSubcategory);

module.exports = router;
