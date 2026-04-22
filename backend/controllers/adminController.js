const {
  User,
  Product,
  Category,
  Commission,
  Order,
  Role,
  RoleApplication,
  Payment,
  Notification,
  FastFood,
  Service,
  OrderItem,
  DeliveryTask,
  ProductDeletionRequest,
  DeletedProduct,
  sequelize
} = require('../models');
const { getIO } = require('../realtime/socket');
const { Op, fn, col, literal } = require('sequelize');
const bcrypt = require('bcryptjs');
const { normalizeKenyanPhone, validateKenyanPhone } = require('../middleware/validators');

// =====================
// Advanced Inventory Management
// =====================

const normalizeInventoryProductItem = (product) => {
  const plain = product.get ? product.get({ plain: true }) : product;
  const images = [plain.coverImage, ...(Array.isArray(plain.galleryImages) ? plain.galleryImages : []), ...(Array.isArray(plain.images) ? plain.images : [])].filter(Boolean);

  return {
    id: plain.id,
    itemType: 'product',
    name: plain.name,
    stock: Number(plain.stock || 0),
    lowStockThreshold: Number(plain.lowStockThreshold || 5),
    createdAt: plain.createdAt,
    approved: plain.approved,
    reviewStatus: plain.reviewStatus,
    isActive: plain.isActive,
    stockTracked: true,
    coverImage: plain.coverImage || images[0] || null,
    images,
    seller: plain.seller || null
  };
};

const normalizeInventoryFastFoodItem = (item) => {
  const plain = item.get ? item.get({ plain: true }) : item;
  const galleryImages = Array.isArray(plain.galleryImages)
    ? plain.galleryImages
    : (typeof plain.galleryImages === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(plain.galleryImages);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          return [];
        }
      })()
      : []);
  const images = [plain.mainImage, ...galleryImages].filter(Boolean);

  return {
    id: plain.id,
    itemType: 'fastfood',
    name: plain.name,
    stock: null,
    lowStockThreshold: null,
    createdAt: plain.createdAt,
    approved: plain.approved,
    reviewStatus: plain.reviewStatus,
    isActive: plain.isActive,
    isAvailable: plain.isAvailable,
    stockTracked: false,
    mainImage: plain.mainImage || images[0] || null,
    images,
    seller: plain.vendorDetail || null
  };
};

const buildInventoryOverview = (products, fastFoods) => {
  const productOverview = products.reduce((acc, product) => {
    const stock = Number(product.stock || 0);
    const lowStockThreshold = Number(product.lowStockThreshold || 5);

    acc.totalTracked += 1;
    if (stock === 0) {
      acc.outOfStock += 1;
    } else if (stock <= lowStockThreshold) {
      acc.lowStock += 1;
    } else {
      acc.inStock += 1;
    }

    return acc;
  }, {
    totalTracked: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0
  });

  return {
    totalProducts: productOverview.totalTracked + fastFoods.length,
    totalTracked: productOverview.totalTracked,
    inStock: productOverview.inStock,
    lowStock: productOverview.lowStock,
    outOfStock: productOverview.outOfStock,
    stockUntracked: fastFoods.length,
    fastFoodItems: fastFoods.length
  };
};

// Get inventory overview with stock levels
const getInventoryOverview = async (req, res) => {
  try {
    const isSeller = req.user.role === 'seller';
    const sellerId = req.user.id;

    const productWhere = isSeller ? { sellerId } : {};
    const fastFoodWhere = isSeller ? { vendor: sellerId } : {};

    const [productRows, fastFoodRows] = await Promise.all([
      Product.findAll({
        where: productWhere,
        attributes: ['id', 'name', 'stock', 'lowStockThreshold', 'coverImage', 'galleryImages', 'createdAt', 'approved', 'reviewStatus', 'isActive', 'sellerId'],
        include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email', 'businessName'] }],
        order: [['stock', 'ASC']]
      }),
      FastFood.findAll({
        where: fastFoodWhere,
        attributes: ['id', 'name', 'mainImage', 'galleryImages', 'createdAt', 'isActive', 'isAvailable', 'approved', 'reviewStatus', 'vendor'],
        include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'] }],
        order: [['createdAt', 'DESC']]
      })
    ]);

    const normalizedProducts = productRows.map(normalizeInventoryProductItem);
    const normalizedFastFoods = fastFoodRows.map(normalizeInventoryFastFoodItem);

    const overview = buildInventoryOverview(normalizedProducts, normalizedFastFoods);
    const lowStockProducts = normalizedProducts.filter((product) => product.stock > 0 && product.stock <= product.lowStockThreshold);

    res.json({
      overview,
      lowStockProducts
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting inventory overview', error: e.message });
  }
};

const getInventoryItems = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '10', 10)));
    const search = String(req.query.search || '').trim();
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = String(req.query.sortOrder || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const stockStatus = req.query.stockStatus || 'all';

    const isSeller = req.user.role === 'seller';
    const sellerId = req.user.id;

    const itemType = req.query.itemType || 'all'; // all, product, fastfood
    const offset = (page - 1) * limit;

    const searchCondition = search
      ? {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { shortDescription: { [Op.like]: `%${search}%` } }
        ]
      }
      : {};

    let items = [];
    let totalItems = 0;

    if (itemType === 'product' || itemType === 'all') {
      const productWhere = { ...searchCondition };
      if (isSeller) productWhere.sellerId = sellerId;

      if (stockStatus === 'inStock') {
        productWhere[Op.and] = [...(productWhere[Op.and] || []), sequelize.where(col('stock'), Op.gt, sequelize.fn('COALESCE', col('lowStockThreshold'), 5))];
      } else if (stockStatus === 'lowStock') {
        productWhere[Op.and] = [
          ...(productWhere[Op.and] || []),
          sequelize.where(col('stock'), Op.gt, 0),
          sequelize.where(col('stock'), Op.lte, sequelize.fn('COALESCE', col('lowStockThreshold'), 5))
        ];
      } else if (stockStatus === 'outOfStock') {
        productWhere.stock = 0;
      }

      if (stockStatus !== 'untracked') {
        const { rows, count } = await Product.findAndCountAll({
          where: productWhere,
          attributes: ['id', 'name', 'stock', 'lowStockThreshold', 'coverImage', 'galleryImages', 'createdAt', 'approved', 'reviewStatus', 'isActive', 'sellerId'],
          include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'], required: false }],
          order: [[sortBy === 'stock' ? 'stock' : sortBy === 'dateAdded' ? 'createdAt' : 'name', sortOrder]],
          limit: itemType === 'all' ? undefined : limit,
          offset: itemType === 'all' ? undefined : offset
        });
        items = rows.map(normalizeInventoryProductItem);
        totalItems = count;
      }
    }

    if ((itemType === 'fastfood' || itemType === 'all') && (stockStatus === 'all' || stockStatus === 'untracked')) {
      const fastFoodWhere = { ...searchCondition };
      if (isSeller) fastFoodWhere.vendor = sellerId;

      const { rows, count } = await FastFood.findAndCountAll({
        where: fastFoodWhere,
        attributes: ['id', 'name', 'mainImage', 'galleryImages', 'createdAt', 'isActive', 'isAvailable', 'approved', 'reviewStatus', 'vendor'],
        include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'], required: false }],
        order: [[sortBy === 'dateAdded' ? 'createdAt' : 'name', sortOrder]],
        limit: itemType === 'all' ? undefined : limit,
        offset: itemType === 'all' ? undefined : offset
      });
      const normalizedFastFoods = rows.map(normalizeInventoryFastFoodItem);
      
      if (itemType === 'all') {
        items = [...items, ...normalizedFastFoods].sort((left, right) => {
          if (sortBy === 'stock') {
            const leftStock = left.stockTracked ? Number(left.stock || 0) : Number.MAX_SAFE_INTEGER;
            const rightStock = right.stockTracked ? Number(right.stock || 0) : Number.MAX_SAFE_INTEGER;
            return sortOrder === 'desc' ? rightStock - leftStock : leftStock - rightStock;
          }
          if (sortBy === 'dateAdded') {
            return (new Date(right.createdAt) - new Date(left.createdAt)) * (sortOrder === 'desc' ? 1 : -1);
          }
          return left.name.localeCompare(right.name) * (sortOrder === 'desc' ? -1 : 1);
        });
        totalItems += count;
        items = items.slice(offset, offset + limit);
      } else {
        items = normalizedFastFoods;
        totalItems = count;
      }
    }

    res.json({
      items,
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        totalItems,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error getting inventory items', error: error.message });
  }
};

// Get low stock alerts
const getLowStockAlerts = async (req, res) => {
  try {
    const isSeller = req.user.role === 'seller';
    const sellerId = req.user.id;

    const where = {
      [Op.or]: [
        { stock: { [Op.lte]: col('lowStockThreshold') } },
        { stock: 0 }
      ]
    };

    if (isSeller) where.sellerId = sellerId;

    const alerts = await Product.findAll({
      where,
      include: [{ model: User, as: 'seller', attributes: ['name', 'email', 'phone', 'businessName'] }],
      order: [['stock', 'ASC']]
    });
    res.json(alerts);
  } catch (e) {
    res.status(500).json({ message: 'Error getting low stock alerts', error: e.message });
  }
};

// Update stock levels for a product
const updateStockLevels = async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, lowStockThreshold, variantName, optionName } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Authorization check: Seller can only update their own products
    const isSeller = req.user.role === 'seller';
    const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(req.user.role);

    if (isSeller && product.sellerId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this product inventory' });
    }

    // Handle variant stock update if provided
    if (variantName && optionName && stock !== undefined) {
      let variants = product.variants;
      if (typeof variants === 'string') {
        try { variants = JSON.parse(variants); } catch (e) { variants = []; }
      }
      if (!Array.isArray(variants)) variants = [];

      let variantFound = false;
      const updatedVariants = variants.map(v => {
        if (v.name === variantName && v.optionDetails && v.optionDetails[optionName]) {
          v.optionDetails[optionName].stock = parseInt(stock);
          variantFound = true;
        }
        return v;
      });

      if (variantFound) {
        product.variants = updatedVariants;
        // Mark variants as changed for Sequelize if it's a JSON field
        product.changed('variants', true);
        
        // Recalculate total stock as sum of variants
        // We take the sum from the variant group that was just updated
        const targetVariant = updatedVariants.find(v => v.name === variantName);
        if (targetVariant && targetVariant.optionDetails) {
          const totalStock = Object.values(targetVariant.optionDetails).reduce((sum, opt) => {
            return sum + (parseInt(opt.stock) || 0);
          }, 0);
          product.stock = totalStock;
        }
      }
    } else if (stock !== undefined) {
      product.stock = parseInt(stock);
    }

    if (lowStockThreshold !== undefined) product.lowStockThreshold = parseInt(lowStockThreshold);

    // Reset alert flag if stock is above threshold
    if (product.stock > (product.lowStockThreshold || 0)) {
      product.outOfStockAlertSent = false;
    }

    await product.save();
    res.json({ message: 'Stock levels updated', product });
  } catch (e) {
    res.status(500).json({ message: 'Error updating stock levels', error: e.message });
  }
};

// Bulk update stock levels
const bulkUpdateStock = async (req, res) => {
  try {
    const { updates } = req.body; // [{ productId, stock, lowStockThreshold }]
    const results = [];

    for (const update of updates) {
      const product = await Product.findByPk(update.productId);
      if (product) {
        if (update.stock !== undefined) product.stock = parseInt(update.stock);
        if (update.lowStockThreshold !== undefined) product.lowStockThreshold = parseInt(update.lowStockThreshold);
        await product.save();
        results.push({ productId: update.productId, success: true });
      } else {
        results.push({ productId: update.productId, success: false, error: 'Product not found' });
      }
    }

    res.json({ message: 'Bulk stock update completed', results });
  } catch (e) {
    res.status(500).json({ message: 'Error in bulk stock update', error: e.message });
  }
};

// =====================
// Product Analytics
// =====================

// Get comprehensive product analytics
const getProductAnalytics = async (req, res) => {
  try {
    const totalProducts = await Product.count();
    const approvedProducts = await Product.count({ where: { approved: true } });
    const pendingProducts = await Product.count({ where: { approved: false } });
    const featuredProducts = await Product.count({ where: { featured: true } });
    const flashSaleProducts = await Product.count({ where: { isFlashSale: true } });

    // Average metrics
    const avgPrice = await Product.aggregate('displayPrice', 'AVG', { where: { displayPrice: { [Op.ne]: null } } });
    const avgRating = await Product.aggregate('averageRating', 'AVG', { where: { averageRating: { [Op.gt]: 0 } } });

    res.json({
      overview: {
        totalProducts,
        approvedProducts,
        pendingProducts,
        featuredProducts,
        flashSaleProducts
      },
      averages: {
        avgPrice: parseFloat(avgPrice || 0),
        avgRating: parseFloat(avgRating || 0)
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting product analytics', error: e.message });
  }
};

// Get top performing products
const getTopPerformingProducts = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Aggregate sales from OrderItems within the date range
    const topItems = await OrderItem.findAll({
      attributes: [
        'productId',
        [fn('SUM', col('quantity')), 'totalQuantity'],
        [fn('SUM', literal('price * quantity')), 'totalRevenue'],
        [fn('COUNT', col('OrderItem.id')), 'orderCount']
      ],
      where: {
        productId: { [Op.ne]: null },
        createdAt: { [Op.between]: [start, end] }
      },
      include: [{
        model: Product,
        attributes: ['id', 'name', 'displayPrice', 'coverImage', 'approved'],
        include: [{
          model: User,
          as: 'seller',
          attributes: ['name', 'businessName']
        }]
      }],
      group: ['productId'],
      order: [[literal('totalQuantity'), 'DESC']],
      limit: parseInt(limit),
      raw: false
    });

    const products = topItems
      .filter(item => item.Product)
      .map(item => ({
        id: item.Product.id,
        name: item.Product.name,
        displayPrice: item.Product.displayPrice,
        coverImage: item.Product.coverImage,
        seller: item.Product.seller,
        totalQuantity: parseInt(item.dataValues.totalQuantity) || 0,
        totalRevenue: parseFloat(item.dataValues.totalRevenue) || 0,
        orderCount: parseInt(item.dataValues.orderCount) || 0
      }));

    res.json({ success: true, products, dateRange: { start, end } });
  } catch (e) {
    console.error('Error getting top performing products:', e);
    res.status(500).json({ message: 'Error getting top performing products', error: e.message });
  }
};

// Get detailed performance metrics for a product
const getProductPerformanceMetrics = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId);

    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Calculate conversion rate (orders/views)
    const conversionRate = product.viewCount > 0 ? (product.orderCount / product.viewCount) * 100 : 0;

    // Get recent order history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOrders = await Order.count({
      where: {
        createdAt: { [Op.gte]: thirtyDaysAgo }
      },
      include: [{
        model: require('../models/OrderItem'),
        where: { productId },
        required: true
      }]
    });

    res.json({
      product: product.toJSON(),
      metrics: {
        conversionRate,
        recentOrders,
        performance: {
          excellent: conversionRate > 5,
          good: conversionRate > 2,
          needs_improvement: conversionRate <= 2
        }
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting product performance metrics', error: e.message });
  }
};

// =====================
// Bulk Operations
// =====================

// Bulk update products
const bulkUpdateProducts = async (req, res) => {
  try {
    const { productIds, updates } = req.body; // updates: { categoryId, commissionRate, etc. }

    const [count] = await Product.update(updates, {
      where: { id: productIds }
    });

    res.json({ message: `Updated ${count} products`, updatedCount: count });
  } catch (e) {
    res.status(500).json({ message: 'Error in bulk product update', error: e.message });
  }
};

// Bulk update categories
const bulkUpdateCategories = async (req, res) => {
  try {
    const { productIds, categoryId } = req.body;

    const [count] = await Product.update(
      { categoryId },
      { where: { id: productIds } }
    );

    res.json({ message: `Updated category for ${count} products`, updatedCount: count });
  } catch (e) {
    res.status(500).json({ message: 'Error in bulk category update', error: e.message });
  }
};

// Bulk update prices
const bulkUpdatePrices = async (req, res) => {
  try {
    const { productIds, priceType, adjustmentType, value } = req.body;
    // priceType: 'displayPrice' | 'basePrice'
    // adjustmentType: 'fixed' | 'percentage'
    // value: number

    let updateData = {};

    if (adjustmentType === 'percentage') {
      // For percentage updates, we need to calculate new prices
      const products = await Product.findAll({ where: { id: productIds } });

      for (const product of products) {
        const currentPrice = product[priceType] || 0;
        const newPrice = currentPrice * (1 + value / 100);
        await product.update({ [priceType]: newPrice });
      }

      res.json({ message: `Updated prices for ${products.length} products with ${value}% ${value > 0 ? 'increase' : 'decrease'} ` });
    } else {
      // Fixed amount adjustment
      updateData[priceType] = literal(`${priceType} + ${value} `);
      const [count] = await Product.update(updateData, { where: { id: productIds } });
      res.json({ message: `Updated prices for ${count} products by KSh ${value} `, updatedCount: count });
    }
  } catch (e) {
    res.status(500).json({ message: 'Error in bulk price update', error: e.message });
  }
};

// Bulk update status
const bulkUpdateStatus = async (req, res) => {
  try {
    const { productIds, status, approved } = req.body;

    const updates = {};
    if (status) updates.reviewStatus = status;
    if (approved !== undefined) updates.approved = approved;

    const [count] = await Product.update(updates, { where: { id: productIds } });

    res.json({ message: `Updated status for ${count} products`, updatedCount: count });
  } catch (e) {
    res.status(500).json({ message: 'Error in bulk status update', error: e.message });
  }
};

// =====================
// Quality Monitoring
// =====================

// Get quality metrics overview
const getQualityMetrics = async (req, res) => {
  try {
    const totalProducts = await Product.count();
    const flaggedProducts = await Product.count({ where: { flaggedForReview: true } });
    const avgQualityScore = await Product.aggregate('qualityScore', 'AVG');

    const qualityDistribution = await Product.findAll({
      attributes: [
        [fn('FLOOR', literal('qualityScore / 20')), 'scoreRange'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: { qualityScore: { [Op.ne]: null } },
      group: [fn('FLOOR', literal('qualityScore / 20'))],
      raw: true
    });

    res.json({
      overview: {
        totalProducts,
        flaggedProducts,
        avgQualityScore: parseFloat(avgQualityScore || 0)
      },
      qualityDistribution
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting quality metrics', error: e.message });
  }
};

// Flag product for review
const flagProductForReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { reason } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.flaggedForReview = true;
    product.flagReason = reason;
    await product.save();

    res.json({ message: 'Product flagged for review', product });
  } catch (e) {
    res.status(500).json({ message: 'Error flagging product', error: e.message });
  }
};

// Get flagged products
const getFlaggedProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { flaggedForReview: true },
      include: [{ model: User, as: 'seller', attributes: ['name', 'email', 'businessName'] }],
      order: [['updatedAt', 'DESC']]
    });

    res.json(products);
  } catch (e) {
    res.status(500).json({ message: 'Error getting flagged products', error: e.message });
  }
};

// Update product quality score
const updateProductQualityScore = async (req, res) => {
  try {
    const { productId } = req.params;
    const { qualityScore } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.qualityScore = parseFloat(qualityScore);
    if (product.qualityScore >= 80) {
      product.flaggedForReview = false;
      product.flagReason = null;
    }

    await product.save();
    res.json({ message: 'Quality score updated', product });
  } catch (e) {
    res.status(500).json({ message: 'Error updating quality score', error: e.message });
  }
};

// =====================
// Advanced Promotions Management
// =====================

// Create category-wide promotion
const createCategoryPromotion = async (req, res) => {
  try {
    const { categoryId, discountPercentage, startDate, endDate } = req.body;

    const [count] = await Product.update({
      isFlashSale: true,
      discountPercentage: parseFloat(discountPercentage),
      flashSaleEndTime: new Date(endDate)
    }, {
      where: { categoryId, approved: true }
    });

    res.json({ message: `Created promotion for ${count} products in category`, updatedCount: count });
  } catch (e) {
    res.status(500).json({ message: 'Error creating category promotion', error: e.message });
  }
};

// Get promotion analytics
const getPromotionAnalytics = async (req, res) => {
  try {
    const activePromotions = await Product.count({
      where: {
        isFlashSale: true,
        flashSaleEndTime: { [Op.gt]: new Date() }
      }
    });

    const totalDiscountValue = await Product.sum('discountPercentage', {
      where: { isFlashSale: true }
    });

    res.json({
      activePromotions,
      totalDiscountValue: parseFloat(totalDiscountValue || 0)
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting promotion analytics', error: e.message });
  }
};

// Manage featured products
const manageFeaturedProducts = async (req, res) => {
  try {
    const { productId } = req.params;
    const { featured, featuredUntil } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.featured = featured;
    if (featuredUntil) product.featuredUntil = new Date(featuredUntil);
    await product.save();

    res.json({ message: 'Featured status updated', product });
  } catch (e) {
    res.status(500).json({ message: 'Error managing featured product', error: e.message });
  }
};

// =====================
// Search and Discovery Management
// =====================

// Update search priority
const updateSearchPriority = async (req, res) => {
  try {
    const { productId } = req.params;
    const { searchPriority } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.searchPriority = parseInt(searchPriority);
    await product.save();

    res.json({ message: 'Search priority updated', product });
  } catch (e) {
    res.status(500).json({ message: 'Error updating search priority', error: e.message });
  }
};

// Get search analytics (placeholder for future implementation)
const getSearchAnalytics = async (req, res) => {
  try {
    // This would integrate with search logs in a real implementation
    const highPriorityProducts = await Product.count({ where: { searchPriority: { [Op.gt]: 0 } } });
    const featuredProducts = await Product.count({ where: { featured: true } });

    res.json({
      highPriorityProducts,
      featuredProducts,
      note: 'Full search analytics would require search log integration'
    });
  } catch (e) {
    res.status(500).json({ message: 'Error getting search analytics', error: e.message });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }
    if (role && role !== 'all') {
      where.role = role;
    }
    if (status === 'active') {
      where.isDeactivated = false;
    } else if (status === 'inactive') {
      where.isDeactivated = true;
    } else if (status === 'verified') {
      where[Op.or] = [
        { role: ['admin', 'superadmin', 'super_admin'] },
        {
          [Op.and]: [
            { emailVerified: true },
            { phoneVerified: true },
            { nationalIdStatus: 'approved' }
          ]
        }
      ];
    } else if (status === 'unverified') {
      where[Op.and] = [
        { role: { [Op.notIn]: ['admin', 'superadmin', 'super_admin'] } },
        {
          [Op.or]: [
            { emailVerified: false },
            { phoneVerified: false },
            { nationalIdStatus: { [Op.ne]: 'approved' } }
          ]
        }
      ];
    }

    const isSqlite = sequelize.options.dialect === 'sqlite';
    const textCast = isSqlite ? 'TEXT' : 'CHAR';
    const quote = isSqlite ? '"' : '`';

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { 
        exclude: ['password'],
        include: [
          [
            literal(`(
              SELECT COUNT(DISTINCT ${quote}identifier${quote})
              FROM (
                SELECT CAST(${quote}id${quote} AS ${textCast}) as ${quote}identifier${quote}
                FROM ${quote}User${quote} as ${quote}u2${quote}
                WHERE ${quote}u2${quote}.${quote}referredByReferralCode${quote} = ${quote}User${quote}.${quote}referralCode${quote}
                
                UNION
                
                SELECT CAST(${quote}userId${quote} AS ${textCast}) as ${quote}identifier${quote}
                FROM ${quote}Order${quote} as ${quote}o${quote}
                WHERE ${quote}o${quote}.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote} AND ${quote}o${quote}.${quote}userId${quote} IS NOT NULL
                
                UNION
                
                SELECT ${quote}customerEmail${quote} as ${quote}identifier${quote}
                FROM ${quote}Order${quote} as ${quote}o2${quote}
                WHERE ${quote}o2${quote}.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote} AND ${quote}o2${quote}.${quote}userId${quote} IS NULL AND ${quote}o2${quote}.${quote}customerEmail${quote} IS NOT NULL
              ) as referrals
            )`),
            'referralCount'
          ],
          [
            literal(`(
              SELECT COALESCE(SUM(${quote}commissionAmount${quote}), 0)
              FROM ${quote}Commission${quote} AS c
              WHERE c.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote}
              AND c.${quote}status${quote} != 'cancelled'
            )`),
            'totalCommission'
          ]
        ]
      },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: offset
    });

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error while fetching users.', error: error.message });
  }
};

// Create User
const createUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, roles } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Enforce 'customer' role is always present
    const finalRoles = [...new Set(['customer', ...(roles || []), (role ? [role] : [])])];
    const finalRole = role || (finalRoles.length > 0 ? finalRoles[finalRoles.length - 1] : 'customer');

    // Normalize and validate phone
    const normalizedPhone = normalizeKenyanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Invalid Kenyan phone number format. Use 01... or 07... (10 digits) or +254... (13 digits)' });
    }

    const user = await User.create({
      name,
      email,
      phone: normalizedPhone,
      password: hashedPassword,
      role: finalRole,
      roles: finalRoles,
      isVerified: true
    });
    const userJson = user.toJSON();
    delete userJson.password;
    res.status(201).json({ message: 'User created', user: userJson });
  } catch (e) {
    res.status(500).json({ message: 'Error creating user', error: e.message });
  }
};

// Update User
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`[adminController] Updating user ${userId} with keys:`, Object.keys(req.body));
    const updateData = { ...req.body };
    delete updateData.password; // Don't allow password update here

    // Sanitize data: Convert empty strings to null for nullable fields
    // This prevents CHECK constraint failures for ENUM fields like gender
    const nullableFields = ['gender', 'campus', 'bio', 'dateOfBirth'];
    nullableFields.forEach(field => {
      if (updateData[field] === '') {
        updateData[field] = null;
      }
    });

    // Normalize and validate phone if provided
    if (updateData.phone) {
      const normalizedPhone = normalizeKenyanPhone(updateData.phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: 'Invalid Kenyan phone number format. Use 01... or 07... (10 digits) or +254... (13 digits)' });
      }
      updateData.phone = normalizedPhone;
    }

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Sync role and roles array
    if (updateData.roles && Array.isArray(updateData.roles)) {
      // Explicitly set the roles array if provided (don't just append)
      // Enforce 'customer' role is always present
      const newRoles = [...new Set(['customer', ...updateData.roles])];

      // Protective logic for super_admin
      const isSuperAdminNow = user.roles?.includes('super_admin');
      const willBeSuperAdmin = newRoles.includes('super_admin');

      // Only allowing a superadmin to add/remove the super_admin role
      const requestingUserRole = req.user?.role || 'customer';
      const isRequesterSuperAdmin = requestingUserRole === 'super_admin' || req.user?.roles?.includes('super_admin');

      if (isSuperAdminNow !== willBeSuperAdmin && !isRequesterSuperAdmin) {
        return res.status(403).json({ message: 'Only a super admin can manage the super_admin role' });
      }

      updateData.roles = newRoles;

      // Ensure the primary 'role' is one of the assigned roles
      // If the specific 'role' field was also sent, use it if it's in the new roles
      if (updateData.role) {
        if (!newRoles.includes(updateData.role)) {
          // If the requested primary role isn't in the array, add it
          newRoles.push(updateData.role);
          updateData.roles = [...new Set(newRoles)];
        }
      } else {
        // If 'role' not sent, pick a sensible primary (last one, or admin if present)
        if (newRoles.includes('super_admin')) {
          updateData.role = 'super_admin';
        } else if (newRoles.includes('admin')) {
          updateData.role = 'admin';
        } else if (newRoles.length > 0) {
          updateData.role = newRoles[newRoles.length - 1];
        } else {
          updateData.role = 'customer';
          updateData.roles = ['customer'];
        }
      }
    } else if (updateData.role) {
      // Handle legacy single-role update
      let currentRoles = user.roles || ['customer'];
      if (!Array.isArray(currentRoles)) {
        currentRoles = [user.role || 'customer'];
      }

      // Add new role to roles array if not present
      if (!currentRoles.includes(updateData.role)) {
        updateData.roles = [...new Set([...currentRoles, updateData.role])];
      }
    }

    console.log('[adminController] Applying update to user model...');
    // Capture previous status for notifications
    const previousIdStatus = user.nationalIdStatus;

    await user.update(updateData);
    console.log('[adminController] User updated successfully');

    // Recalculate isVerified based on standard criteria
    await user.recalculateIsVerified();

    // Check for ID verification status change and notify
    if (updateData.nationalIdStatus && updateData.nationalIdStatus !== previousIdStatus) {
      if (updateData.nationalIdStatus === 'approved') {
        try {
          const n = await Notification.create({
            userId: user.id,
            title: 'ID Verification Approved',
            message: 'Your National ID has been verified successfully. You are now a verified user.',
            type: 'success'
          });
          const io = getIO();
          if (io) io.to(`user:${user.id}`).emit('notification:new', n);
        } catch (err) {
          console.error('[adminController] Failed to send ID approval notification:', err);
        }
      } else if (updateData.nationalIdStatus === 'rejected') {
        try {
          const reason = updateData.nationalIdRejectionReason || 'Document invalid or unclear.';
          const n = await Notification.create({
            userId: user.id,
            title: 'ID Verification Rejected',
            message: `Your National ID verification was rejected. Reason: ${reason}`,
            type: 'error'
          });
          const io = getIO();
          if (io) io.to(`user:${user.id}`).emit('notification:new', n);
        } catch (err) {
          console.error('[adminController] Failed to send ID rejection notification:', err);
        }
      }
    }

    res.json({ message: 'User updated', user });
  } catch (e) {
    console.error('[adminController] Error updating user:', e);

    // Log detailed validation errors
    if (e.name === 'SequelizeValidationError' || e.name === 'SequelizeUniqueConstraintError') {
      console.error('[adminController] Validation errors:', e.errors?.map(err => ({
        field: err.path,
        value: err.value,
        message: err.message,
        type: err.type
      })));
    }

    res.status(500).json({
      message: 'Error updating user',
      error: e.message,
      validationErrors: e.errors?.map(err => ({
        field: err.path,
        message: err.message
      })),
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

// Delete User
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await user.destroy();
    res.json({ message: 'User deleted' });
  } catch (e) {
    res.status(500).json({ message: 'Error deleting user', error: e.message });
  }
};

// User Analytics (Centralized)
const getUserAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { isDeactivated: false } });
    const deactivatedUsers = await User.count({ where: { isDeactivated: true } });

    // Count by role
    const roles = ['customer', 'marketer', 'seller', 'delivery_agent', 'service_provider', 'admin', 'super_admin'];
    const roleCounts = {};
    for (const role of roles) {
      roleCounts[role] = await User.count({ where: { role } });
    }

    const pendingApplications = await RoleApplication.count({ where: { status: 'pending' } });

    res.json({
      totalUsers,
      activeUsers,
      deactivatedUsers,
      roleCounts,
      pendingApplications
    });
  } catch (e) {
    res.status(500).json({ message: 'Error fetching user analytics', error: e.message });
  }
};

// List users who requested account deletion
const listDeletionRequests = async (_req, res) => {
  try {
    const users = await User.findAll({ where: { deletionRequested: true }, attributes: { exclude: ['password'] } });
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: 'Server error fetching deletion requests.', error: e.message });
  }
};

// =====================
// Commissions (Admin)
// =====================
const listCommissionsAdmin = async (req, res) => {
  try {
    const { status, marketerId, from, to } = req.query || {};
    const where = {};
    if (status && status !== 'all') where.status = status;

    if (marketerId && marketerId !== 'undefined' && marketerId !== 'null') {
      where.marketerId = parseInt(marketerId, 10);
    }

    if (from || to) {
      where.createdAt = {};
      if (from && from !== 'undefined' && from !== 'null') {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) where.createdAt[Op.gte] = fromDate;
      }
      if (to && to !== 'undefined' && to !== 'null') {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          where.createdAt[Op.lte] = toDate;
        }
      }
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    console.log(' [listCommissionsAdmin] Loading commissions with where:', JSON.stringify(where));

    const rows = await Commission.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'marketer', attributes: ['id', 'name', 'email', 'role'] },
        { model: Order },
        { model: Product, attributes: ['id', 'name', 'marketingCommission', 'sellerId'] }
      ]
    });

    // Transform for frontend compatibility (both FinanceManager and CommissionManagement)
    const transformed = rows.map(r => {
      const data = r.toJSON();
      return {
        ...data,
        amount: data.commissionAmount, // For CommissionManagement.jsx
        rate: data.commissionRate,     // For CommissionManagement.jsx
        Seller: data.marketer,         // For CommissionManagement.jsx
        Item: data.Product || { name: 'N/A' }
      };
    });

    res.json(transformed);
  } catch (e) {
    console.error(' [listCommissionsAdmin ERROR]:', e);
    res.status(500).json({
      message: 'Error listing commissions',
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

const bulkPayCommissions = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' });
    const [count] = await Commission.update(
      { status: 'paid', paidAt: new Date() },
      { where: { id: ids, status: 'pending' } }
    );
    res.json({ message: 'Bulk pay completed', updated: count });
  } catch (e) {
    res.status(500).json({ message: 'Error bulk paying commissions', error: e.message });
  }
};

const bulkCancelCommissions = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' });
    const [count] = await Commission.update(
      { status: 'cancelled' },
      { where: { id: ids, status: 'pending' } }
    );
    res.json({ message: 'Bulk cancel completed', updated: count });
  } catch (e) {
    res.status(500).json({ message: 'Error bulk cancelling commissions', error: e.message });
  }
};

// =====================
// Referral analytics (Admin)
// =====================
const referralAnalytics = async (_req, res) => {
  try {
    const clicks = await ReferralTracking.findAll({
      attributes: ['referrerId', [fn('COUNT', col('id')), 'clicks']],
      group: ['referrerId']
    });

    const conversions = await ReferralTracking.findAll({
      where: { convertedAt: { [Op.ne]: null } },
      attributes: ['referrerId', [fn('COUNT', col('id')), 'conversions']],
      group: ['referrerId']
    });

    const earnings = await Commission.findAll({
      attributes: [
        'marketerId',
        [fn('SUM', col('commissionAmount')), 'commissionTotal'],
        [fn('SUM', literal("CASE WHEN status='pending' THEN commissionAmount ELSE 0 END")), 'pendingTotal'],
        [fn('SUM', literal("CASE WHEN status='paid' THEN commissionAmount ELSE 0 END")), 'paidTotal']
      ],
      group: ['marketerId']
    });

    res.json({ clicks, conversions, earnings });
  } catch (e) {
    res.status(500).json({ message: 'Error generating referral analytics', error: e.message });
  }
};

// =====================
// Marketer management (Admin)
// =====================
const listMarketers = async (_req, res) => {
  try {
    const isSqlite = sequelize.options.dialect === 'sqlite';
    const textCast = isSqlite ? 'TEXT' : 'CHAR';
    const quote = isSqlite ? '"' : '`';

    const marketers = await User.findAll({
      where: { role: 'marketer' },
      attributes: {
        exclude: ['password'],
        include: [
          [
            literal(`(
              SELECT COUNT(DISTINCT ${quote}identifier${quote})
              FROM (
                SELECT CAST(${quote}id${quote} AS ${textCast}) as ${quote}identifier${quote}
                FROM ${quote}User${quote} as ${quote}u2${quote}
                WHERE ${quote}u2${quote}.${quote}referredByReferralCode${quote} = ${quote}User${quote}.${quote}referralCode${quote}
                
                UNION
                
                SELECT CAST(${quote}userId${quote} AS ${textCast}) as ${quote}identifier${quote}
                FROM ${quote}Order${quote} as ${quote}o${quote}
                WHERE ${quote}o${quote}.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote} AND ${quote}o${quote}.${quote}userId${quote} IS NOT NULL
                
                UNION
                
                SELECT ${quote}customerEmail${quote} as ${quote}identifier${quote}
                FROM ${quote}Order${quote} as ${quote}o2${quote}
                WHERE ${quote}o2${quote}.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote} AND ${quote}o2${quote}.${quote}userId${quote} IS NULL AND ${quote}o2${quote}.${quote}customerEmail${quote} IS NOT NULL
              ) as referrals
            )`),
            'referralCount'
          ],
          [
            literal(`(
              SELECT COALESCE(SUM(${quote}commissionAmount${quote}), 0)
              FROM ${quote}Commission${quote} AS c
              WHERE c.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote}
              AND c.${quote}status${quote} != 'cancelled'
            )`),
            'totalCommission'
          ],
          [
            literal(`(
              SELECT COALESCE(SUM(${quote}total${quote}), 0)
              FROM ${quote}Order${quote} AS o3
              WHERE o3.${quote}marketerId${quote} = ${quote}User${quote}.${quote}id${quote}
              AND o3.${quote}status${quote} NOT IN ('cancelled', 'failed')
            )`),
            'totalRevenue'
          ]
        ]
      }
    });
    res.json(marketers);
  } catch (e) {
    res.status(500).json({ message: 'Error listing marketers', error: e.message });
  }
};

// Internal helper for role-based suspension
const _applyRoleSuspension = async (userId, role, suspend = true) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error('User not found');

  let suspendedRoles = Array.isArray(user.suspendedRoles) ? [...user.suspendedRoles] : [];
  
  if (suspend) {
    if (!suspendedRoles.includes(role)) {
      suspendedRoles.push(role);
      user.suspendedRoles = suspendedRoles;
      // Sync legacy flags
      if (role === 'marketer') user.isMarketerSuspended = true;
      if (role === 'seller') user.isSellerSuspended = true;
      if (role === 'delivery_agent') user.isDeliverySuspended = true;
      user.isDeactivated = false; // Never block global access during role suspension
    }
  } else {
    user.suspendedRoles = suspendedRoles.filter(r => r !== role);
    // Sync legacy flags
    if (role === 'marketer') user.isMarketerSuspended = false;
    if (role === 'seller') user.isSellerSuspended = false;
    if (role === 'delivery_agent') user.isDeliverySuspended = false;
  }
  
  await user.save();
  return user;
};

// Internal helper for admin password verification
const _verifyAdminAction = async (adminId, password) => {
  if (!password) return false;
  const masterPassword = (process.env.ADMIN_PASSWORD || 'comrades360admin').trim();
  const adminUser = await User.findByPk(adminId);
  const isMasterValid = password.trim() === masterPassword;
  const isAccountValid = adminUser && adminUser.password ? await bcrypt.compare(password.trim(), adminUser.password) : false;
  return isMasterValid || isAccountValid;
};

const suspendMarketer = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminPassword } = req.body;
    if (!await _verifyAdminAction(req.user.id, adminPassword)) {
      return res.status(403).json({ message: 'Incorrect admin password' });
    }
    await _applyRoleSuspension(userId, 'marketer', true);
    res.json({ message: 'Marketer suspended from dashboard access', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error suspending marketer', error: e.message });
  }
};

const reactivateMarketer = async (req, res) => {
  try {
    const { userId } = req.params;
    await _applyRoleSuspension(userId, 'marketer', false);
    res.json({ message: 'Marketer reactivated', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error reactivating marketer', error: e.message });
  }
};

const suspendSeller = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminPassword } = req.body;
    if (!await _verifyAdminAction(req.user.id, adminPassword)) {
      return res.status(403).json({ message: 'Incorrect admin password' });
    }
    await _applyRoleSuspension(userId, 'seller', true);
    res.json({ message: 'Seller suspended from dashboard access', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error suspending seller', error: e.message });
  }
};

const reactivateSeller = async (req, res) => {
  try {
    const { userId } = req.params;
    await _applyRoleSuspension(userId, 'seller', false);
    res.json({ message: 'Seller reactivated', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error reactivating seller', error: e.message });
  }
};

const suspendDeliveryAgent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminPassword } = req.body;
    if (!await _verifyAdminAction(req.user.id, adminPassword)) {
      return res.status(403).json({ message: 'Incorrect admin password' });
    }
    await _applyRoleSuspension(userId, 'delivery_agent', true);
    res.json({ message: 'Delivery agent suspended from dashboard access', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error suspending delivery agent', error: e.message });
  }
};

const reactivateDeliveryAgent = async (req, res) => {
  try {
    const { userId } = req.params;
    await _applyRoleSuspension(userId, 'delivery_agent', false);
    res.json({ message: 'Delivery agent reactivated', userId });
  } catch (e) {
    res.status(500).json({ message: 'Error reactivating delivery agent', error: e.message });
  }
};

const suspendUserRoleGeneric = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, adminPassword } = req.body;
    if (!role) return res.status(400).json({ message: 'Role name is required' });
    if (!await _verifyAdminAction(req.user.id, adminPassword)) {
      return res.status(403).json({ message: 'Incorrect admin password' });
    }
    await _applyRoleSuspension(userId, role, true);
    res.json({ message: `${role} access suspended`, userId });
  } catch (e) {
    res.status(500).json({ message: 'Error suspending role', error: e.message });
  }
};

const reactivateUserRoleGeneric = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!role) return res.status(400).json({ message: 'Role name is required' });
    await _applyRoleSuspension(userId, role, false);
    res.json({ message: `${role} access reactivated`, userId });
  } catch (e) {
    res.status(500).json({ message: 'Error reactivating role', error: e.message });
  }
};

const generateReferralCode = () => `REF - ${Math.random().toString(36).slice(2, 8).toUpperCase()} -${Date.now().toString().slice(-4)} `;

const revokeReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminPassword } = req.body;

    // Security Verification
    if (!adminPassword) {
      return res.status(401).json({ message: 'Admin password is required for this action' });
    }

    const masterPassword = (process.env.ADMIN_PASSWORD || 'comrades360admin').trim();
    const adminUser = await User.findByPk(req.user.id);
    const isMasterValid = adminPassword.trim() === masterPassword;
    const isAccountValid = adminUser && adminUser.password ? await bcrypt.compare(adminPassword.trim(), adminUser.password) : false;

    if (!isMasterValid && !isAccountValid) {
      return res.status(403).json({ message: 'Incorrect admin password' });
    }

    const user = await User.findByPk(userId);
    if (!user || user.role !== 'marketer') return res.status(404).json({ message: 'Marketer not found' });
    user.referralCode = null;
    await user.save();
    res.json({ message: 'Referral code revoked', userId: user.id });
  } catch (e) {
    res.status(500).json({ message: 'Error revoking referral code', error: e.message });
  }
};

const assignReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'marketer') return res.status(404).json({ message: 'Marketer not found' });
    let code = generateReferralCode();
    let exists = await User.findOne({ where: { referralCode: code } });
    while (exists) {
      code = generateReferralCode();
      exists = await User.findOne({ where: { referralCode: code } });
    }
    user.referralCode = code;
    await user.save();
    res.json({ message: 'Referral code assigned', userId: user.id, referralCode: code });
  } catch (e) {
    res.status(500).json({ message: 'Error assigning referral code', error: e.message });
  }
};

// =====================
// Commission rate management
// =====================
const updateProductCommissionRate = async (req, res) => {
  try {
    const { productId } = req.params;
    const { commissionRate } = req.body || {};
    if (commissionRate === undefined) return res.status(400).json({ message: 'commissionRate required' });
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.commissionRate = parseFloat(commissionRate);
    await product.save();
    res.json({ message: 'Product commission rate updated', productId: product.id, commissionRate: product.commissionRate });
  } catch (e) {
    res.status(500).json({ message: 'Error updating product commission rate', error: e.message });
  }
};

const batchUpdateCategoryCommissionRate = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { commissionRate } = req.body || {};
    if (commissionRate === undefined) return res.status(400).json({ message: 'commissionRate required' });
    const category = await Category.findByPk(categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    const rate = parseFloat(commissionRate);
    const [count] = await Product.update({ commissionRate: rate }, { where: { categoryId: category.id } });
    res.json({ message: 'Category commission rate applied to products', categoryId: category.id, updatedProducts: count, commissionRate: rate });
  } catch (e) {
    res.status(500).json({ message: 'Error applying category commission rate', error: e.message });
  }
};



// Approve a user's deletion request -> deactivate account and clear flags
const approveDeletionRequest = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.deletionRequested && user.isDeactivated) return res.status(400).json({ message: 'No pending deletion for this user.' });
    user.isDeactivated = true;
    user.deletionRequested = false;
    await user.save();
    try {
      const n = await Notification.create({ userId: user.id, title: 'Account Deactivated', message: 'Your account deletion request has been approved and your account is now deactivated.' });
      const io = getIO(); if (io) io.to(`user:${user.id} `).emit('notification:new', n);
    } catch { }
    res.json({ message: 'Deletion request approved. Account deactivated.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error approving deletion.', error: e.message });
  }
};

// Deny a user's deletion request -> clear flag and notify with reason
const denyDeletionRequest = async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.deletionRequested) return res.status(400).json({ message: 'No pending deletion for this user.' });
    user.deletionRequested = false;
    await user.save();
    try {
      const n = await Notification.create({ userId: user.id, title: 'Deletion Request Denied', message: reason || 'Your account deletion request was denied.' });
      const io = getIO(); if (io) io.to(`user:${user.id} `).emit('notification:new', n);
    } catch { }
    res.json({ message: 'Deletion request denied.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error denying deletion.', error: e.message });
  }
};

// Get all products (any status) with seller and category for Admin
const getAllProductsAdmin = async (req, res) => {
  try {
    // First, get all products without associations to avoid association errors
    const products = await Product.findAll({
      order: [['createdAt', 'DESC']]
    })

    // Then manually fetch seller information for each product
    const productsWithSellers = await Promise.all(
      products.map(async (product) => {
        let seller = null;
        if (product.sellerId) {
          try {
            seller = await User.findByPk(product.sellerId, {
              attributes: ['id', 'name', 'email', 'phone']
            });
          } catch (err) {
            console.warn(`Could not fetch seller for product ${product.id}: `, err.message);
          }
        }

        return {
          ...product.toJSON(),
          seller: seller ? seller.toJSON() : null
        };
      })
    );

    res.status(200).json(productsWithSellers)
  } catch (error) {
    console.error('Error in getAllProductsAdmin:', error);
    res.status(500).json({ message: 'Server error while fetching products.', error: error.message })
  }
}

// Send a notification to the seller of a product
const notifySellerForProduct = async (req, res) => {
  const { productId } = req.params
  const { title, message } = req.body || {}
  if (!title || !message) return res.status(400).json({ message: 'title and message are required' })
  try {
    const p = await Product.findByPk(productId)
    if (!p) return res.status(404).json({ message: 'Product not found.' })
    if (!p.sellerId) return res.status(400).json({ message: 'Product has no seller.' })
    const n = await Notification.create({ userId: p.sellerId, title, message })
    try { const io = getIO(); if (io) io.to(`user:${p.sellerId} `).emit('notification:new', n) } catch { }
    res.status(201).json({ message: 'Notification sent to seller.', notification: n })
  } catch (error) {
    res.status(500).json({ message: 'Server error while sending notification.', error: error.message })
  }
}

// Delete a product (Admin)
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    await product.destroy();
    res.json({ message: 'Product deleted', productId: Number(productId) });
  } catch (error) {
    res.status(500).json({ message: 'Server error while deleting product.', error: error.message });
  }
}

// Configure flash sale for a product
const setProductFlashSale = async (req, res) => {
  const { productId } = req.params;
  const { isFlashSale, discountPercentage, flashSaleEndTime } = req.body;
  try {
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    if (typeof isFlashSale !== 'undefined') product.isFlashSale = !!isFlashSale;
    if (typeof discountPercentage !== 'undefined') product.discountPercentage = parseFloat(discountPercentage) || 0;
    if (typeof flashSaleEndTime !== 'undefined') product.flashSaleEndTime = flashSaleEndTime ? new Date(flashSaleEndTime) : null;

    await product.save();
    res.status(200).json({ message: 'Flash sale configuration updated.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error while updating flash sale.', error: error.message });
  }
};

// Get all products awaiting approval
const getPendingProducts = async (req, res) => {
  try {
    console.log('Fetching pending products...');
    const products = await Product.findAll({
      where: { approved: false, reviewStatus: 'pending' },
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'],
          required: false
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${products.length} pending products`);
    products.forEach(p => {
      console.log(`- Product: ${p.name}, Seller: ${p.Seller?.email || 'No seller'} `);
    });

    res.status(200).json(products);
  } catch (error) {
    console.error('Error in getPendingProducts:', error);
    res.status(500).json({ message: 'Server error while fetching pending products.', error: error.message });
  }
};

// Approve a product
const approveProduct = async (req, res) => {
  const { productId } = req.params;
  const { displayPrice, deliveryFee, deliveryFeeMin, deliveryFeeMax } = req.body || {};
  try {
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    if (displayPrice !== undefined) product.displayPrice = parseFloat(displayPrice);
    if (deliveryFee !== undefined) product.deliveryFee = parseFloat(deliveryFee);
    if (deliveryFeeMin !== undefined) product.deliveryFeeMin = parseFloat(deliveryFeeMin);
    if (deliveryFeeMax !== undefined) product.deliveryFeeMax = parseFloat(deliveryFeeMax);
    product.approved = true;
    product.hasBeenApproved = true;
    product.reviewStatus = 'approved';
    product.reviewNotes = null;
    await product.save();
    // Notify seller of approval (best-effort)
    try {
      if (product.sellerId) {
        const title = 'Product approved';
        const msg = `Great news! Your product "${product.name}" has been approved and is now live.`;
        const n = await Notification.create({ userId: product.sellerId, title, message: msg });
        const io = getIO(); if (io) io.to(`user:${product.sellerId} `).emit('notification:new', n);
      }
    } catch (_) { /* ignore notify errors */ }
    res.status(200).json({ message: 'Product approved successfully.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error while approving product.', error: error.message });
  }
};

// Reject a product with a reason
const rejectProduct = async (req, res) => {
  const { productId } = req.params;
  const { reason } = req.body;
  try {
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    product.approved = false;
    product.reviewStatus = 'rejected';
    product.reviewNotes = reason || 'Rejected by admin';
    await product.save();
    // Best-effort: notify seller about rejection
    try {
      if (product.sellerId) {
        const title = 'Product rejected';
        const msg = `Your product "${product.name}" was rejected.${reason ? ` Reason: ${reason}` : ''} `;
        const n = await Notification.create({ userId: product.sellerId, title, message: msg });
        const io = getIO(); if (io) io.to(`user:${product.sellerId} `).emit('notification:new', n);
      }
    } catch (_) { /* ignore notify errors */ }
    res.status(200).json({ message: 'Product rejected.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error while rejecting product.', error: error.message });
  }
};

// Request changes from seller (without rejecting)
const requestProductChanges = async (req, res) => {
  const { productId } = req.params;
  const { notes } = req.body;
  try {
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    product.approved = false;
    product.reviewStatus = 'changes_requested';
    product.reviewNotes = notes || 'Please address requested changes and resubmit.';
    await product.save();
    // Notify seller of requested changes (best-effort)
    try {
      if (product.sellerId) {
        const title = 'Product changes requested';
        const msg = `Updates needed for your product "${product.name}".${notes ? `Notes: ${notes}` : ''} `.trim();
        const n = await Notification.create({ userId: product.sellerId, title, message: msg });
        const io = getIO(); if (io) io.to(`user:${product.sellerId} `).emit('notification:new', n);
      }
    } catch (_) { /* ignore notify errors */ }
    res.status(200).json({ message: 'Change request recorded.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error while requesting changes.', error: error.message });
  }
};

// Admin can edit minor fields then approve
const editAndApproveProduct = async (req, res) => {
  const { productId } = req.params;
  const { name, description, basePrice, displayPrice, /* stock, */ categoryId, deliveryFee, deliveryFeeMin, deliveryFeeMax } = req.body;
  try {
    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (basePrice !== undefined) product.basePrice = parseFloat(basePrice);
    if (displayPrice !== undefined) product.displayPrice = parseFloat(displayPrice);
    // Stock edits are reserved for sellers; ignore any provided stock from admin
    if (categoryId !== undefined) product.categoryId = parseInt(categoryId, 10);
    if (deliveryFee !== undefined) product.deliveryFee = parseFloat(deliveryFee);
    if (deliveryFeeMin !== undefined) product.deliveryFeeMin = parseFloat(deliveryFeeMin);
    if (deliveryFeeMax !== undefined) product.deliveryFeeMax = parseFloat(deliveryFeeMax);
    product.approved = true;
    product.hasBeenApproved = true;
    product.reviewStatus = 'approved';
    product.reviewNotes = null;
    await product.save();
    res.status(200).json({ message: 'Product edited and approved.', product });
  } catch (error) {
    res.status(500).json({ message: 'Server error while editing/approving product.', error: error.message });
  }
};

// Update a user's role
const updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role: roleId } = req.body;

  if (!roleId) {
    return res.status(400).json({ message: 'Role is required.' });
  }

  // Super Admin role must never be assigned via this endpoint
  if (roleId === 'super_admin') {
    return res.status(403).json({ message: 'Super Admin role cannot be assigned.' });
  }

  const requesterRole = req.user?.role;
  const isSuperAdmin = requesterRole === 'super_admin';

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Fetch the target role from database
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(400).json({ message: 'Invalid role specified.' });
    }

    // Protection logic for management roles
    const managementPermissions = ['adminPanel', 'dashboard'];
    const targetHasManagementAccess = user.roleDetails?.accessLevels?.adminPanel || user.roleDetails?.accessLevels?.dashboard;
    const newHasManagementAccess = role.accessLevels?.adminPanel || role.accessLevels?.dashboard;

    if ((targetHasManagementAccess || newHasManagementAccess) && !isSuperAdmin) {
      return res.status(403).json({ message: 'Only Super Admin can modify or assign management roles.' });
    }

    // Update user role and synchronize access restrictions
    user.role = roleId;
    user.accessRestrictions = role.accessLevels || user.accessRestrictions;

    await user.save();

    // Exclude password from the returned user object
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(200).json({
      message: 'User role updated successfully.',
      user: userResponse
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Server error while updating user role.', error: error.message });
  }
};

// Verify Admin Password - robust implementation for sensitive actions
const verifyAdminPassword = async (req, res) => {
  try {
    let { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, verified: false, message: 'Password is required' });
    }

    // Trim whitespace
    password = password.trim();

    // 1. Check Master Password Fallback (ADMIN_PASSWORD from env or default)
    const masterPassword = (process.env.ADMIN_PASSWORD || 'comrades360admin').trim();
    console.log(`[adminController] Debug: Input length=${password.length}, Master length=${masterPassword.length}`);

    if (password === masterPassword) {
      console.log('[adminController] Verified via Master Password');
      return res.json({ success: true, verified: true });
    }

    // 2. Check individual account password
    const adminUser = await User.findByPk(req.user.id);
    if (!adminUser || !adminUser.password) {
      console.log('[adminController] Admin user not found or no password:', req.user.id);
      return res.status(401).json({ success: false, verified: false, message: 'Admin user not found or has no password set' });
    }

    console.log(`[adminController] Debug: Comparing with account hash (length=${adminUser.password.length})`);
    const isValid = await bcrypt.compare(password, adminUser.password);
    if (isValid) {
      console.log('[adminController] Verified via Account Password');
      return res.json({ success: true, verified: true });
    }

    // Both failed
    console.log('[adminController] Password verification failed for admin:', adminUser.email);
    res.status(401).json({ success: false, verified: false, message: 'Incorrect admin password' });
  } catch (error) {
    console.error('[adminController] Password verification error:', error);
    res.status(500).json({ success: false, verified: false, message: 'Server error during verification' });
  }
};


// Revenue Analytics
const getRevenueAnalytics = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: {
        status: { [Op.in]: ['completed', 'delivered'] }
      },
      include: [
        {
          model: OrderItem,
          as: 'OrderItems',
          include: [
            { model: Product, attributes: ['id', 'basePrice', 'name'] },
            { model: FastFood, attributes: ['id', 'basePrice', 'name'] },
            { model: Service, attributes: ['id', 'basePrice', 'title'] },
            { model: User, as: 'seller', attributes: ['id', 'name', 'role'] }
          ]
        },
        { model: Commission, attributes: ['commissionAmount'] },
        { model: DeliveryTask, as: 'deliveryTasks', attributes: ['agentEarnings'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    let totalItemSaleRevenue = 0; // Platform share
    let totalMarketerRevenue = 0;
    let totalDeliveryRevenue = 0; // Platform share
    let totalAgentRevenue = 0;

    // Aggregate withdrawal fees from completed withdrawal transactions
    const { Transaction } = require('../models');
    const withdrawalTxRows = await Transaction.findAll({
      where: { type: 'debit', status: 'completed' },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'role', 'phone'] }],
      order: [['createdAt', 'DESC']]
    });
    const totalWithdrawalFees = withdrawalTxRows.reduce((sum, t) => sum + parseFloat(t.fee || 0), 0);
    const withdrawalTransactions = withdrawalTxRows.map(t => {
      let meta = {};
      try { meta = t.metadata ? (typeof t.metadata === 'string' ? JSON.parse(t.metadata) : t.metadata) : {}; } catch {}
      return {
        id: t.id,
        userName: t.user?.name || 'Unknown',
        userRole: t.user?.role || '—',
        userPhone: t.user?.phone || '—',
        amount: parseFloat(t.amount || 0),
        fee: parseFloat(t.fee || 0),
        netAmount: parseFloat(meta.netAmountToPay || (t.amount - t.fee) || 0),
        paymentMethod: meta.method || '—',
        paymentReference: meta.payoutReference || meta.paymentReference || '—',
        createdAt: t.createdAt
      };
    });

    const formattedOrders = orders.map(order => {
      let orderMarkup = 0;
      const itemsDetail = (order.OrderItems || []).map(item => {
        const basePrice = parseFloat(item.Product?.basePrice || item.FastFood?.basePrice || item.Service?.basePrice || 0);
        const sellingPrice = parseFloat(item.price || 0);
        const qty = parseInt(item.quantity || 0);
        const markup = (sellingPrice - basePrice) * qty;
        orderMarkup += markup;

        return {
          id: item.id,
          name: item.name || item.Product?.name || item.FastFood?.name || item.Service?.title,
          sellingPrice,
          basePrice,
          quantity: qty,
          markup
        };
      });

      // Marketer Share: Sum of all commissions for this order
      const marketerShare = order.Commissions ? order.Commissions.reduce((sum, c) => sum + parseFloat(c.commissionAmount || 0), 0) : 0;
      const platformItemShare = orderMarkup - marketerShare;

      // Delivery split
      const totalDeliveryFee = parseFloat(order.deliveryFee || 0);
      const agentShare = order.deliveryTasks ? order.deliveryTasks.reduce((sum, t) => sum + parseFloat(t.agentEarnings || 0), 0) : 0;
      const platformDeliveryShare = totalDeliveryFee - agentShare;

      totalItemSaleRevenue += platformItemShare;
      totalMarketerRevenue += marketerShare;
      totalDeliveryRevenue += platformDeliveryShare;
      totalAgentRevenue += agentShare;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        itemSaleRevenue: platformItemShare,
        marketerRevenue: marketerShare,
        deliveryRevenue: platformDeliveryShare,
        agentRevenue: agentShare,
        items: itemsDetail
      };
    });

    res.json({
      summary: {
        itemSaleRevenue: totalItemSaleRevenue,
        marketerRevenue: totalMarketerRevenue,
        deliveryRevenue: totalDeliveryRevenue,
        agentRevenue: totalAgentRevenue,
        withdrawalFeeRevenue: totalWithdrawalFees
      },
      orders: formattedOrders,
      withdrawalTransactions
    });
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ message: 'Error fetching revenue analytics', error: error.message });
  }
};

// =====================
// Platform Wallet Logic
// =====================
const getPlatformWalletDetails = async (req, res) => {
  try {
    const { PlatformWallet, PlatformTransaction } = require('../models');
    
    // Find or create the main platform wallet
    const [wallet, created] = await PlatformWallet.findOrCreate({
      where: { id: 1 },
      defaults: { balance: 0, totalEarned: 0, totalWithdrawn: 0 }
    });

    const transactions = await PlatformTransaction.findAll({
      where: { walletId: wallet.id },
      order: [['createdAt', 'DESC']],
      limit: 100 // pagination could be added later
    });

    res.json({
      wallet,
      transactions
    });
  } catch (error) {
    console.error('Error fetching platform wallet:', error);
    res.status(500).json({ message: 'Error fetching platform wallet data', error: error.message });
  }
};

const withdrawPlatformFunds = async (req, res) => {
  try {
    // Only super_admin can actually withdraw
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only Super Admin can withdraw platform funds' });
    }

    const { amount, destination, reference, notes } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    if (!destination || !reference) {
      return res.status(400).json({ message: 'Destination and Reference are required' });
    }

    const { PlatformWallet, PlatformTransaction, sequelize } = require('../models');
    
    const result = await sequelize.transaction(async (t) => {
      const wallet = await PlatformWallet.findByPk(1, { transaction: t, lock: true });
      if (!wallet) {
        throw new Error('Platform wallet not found');
      }

      if (parseFloat(wallet.balance) < parseFloat(amount)) {
        throw new Error('Insufficient platform funds');
      }

      // Update wallet 
      wallet.balance = parseFloat(wallet.balance) - parseFloat(amount);
      wallet.totalWithdrawn = parseFloat(wallet.totalWithdrawn) + parseFloat(amount);
      await wallet.save({ transaction: t });

      // Create transaction record
      const tx = await PlatformTransaction.create({
        walletId: wallet.id,
        amount: parseFloat(amount),
        type: 'debit',
        sourceType: 'platform_withdrawal',
        referenceId: reference,
        description: `Withdrawal to ${destination}`,
        metadata: { destination, notes, requestedBy: req.user.email }
      }, { transaction: t });

      return { wallet, tx };
    });

    res.json({ message: 'Platform funds withdrawn successfully', data: result });
  } catch (error) {
    console.error('Error withdrawing platform funds:', error);
    res.status(500).json({ message: error.message || 'Error processing platform withdrawal' });
  }
};

module.exports = {
  getAllUsers,
  listDeletionRequests,
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
  approveDeletionRequest,
  denyDeletionRequest,
  getAllProductsAdmin,
  notifySellerForProduct,
  deleteProduct,
  setProductFlashSale,
  getPendingProducts,
  approveProduct,
  rejectProduct,
  requestProductChanges,
  editAndApproveProduct,
  updateUserRole,
  // Advanced inventory management
  getInventoryOverview,
  getInventoryItems,
  getLowStockAlerts,
  updateStockLevels,
  bulkUpdateStock,
  // Product analytics
  getProductAnalytics,
  getTopPerformingProducts,
  getProductPerformanceMetrics,
  // Bulk operations
  bulkUpdateProducts,
  bulkUpdateCategories,
  bulkUpdatePrices,
  bulkUpdateStatus,
  // Quality monitoring
  getQualityMetrics,
  flagProductForReview,
  getFlaggedProducts,
  updateProductQualityScore,
  // Advanced promotions
  createCategoryPromotion,
  getPromotionAnalytics,
  manageFeaturedProducts,
  // Search and discovery
  updateSearchPriority,
  getUserAnalytics,
  createUser,
  updateUser,
  deleteUser,
  getSearchAnalytics,
  verifyAdminPassword,
  getRevenueAnalytics,
  getPlatformWalletDetails,
  withdrawPlatformFunds
};

