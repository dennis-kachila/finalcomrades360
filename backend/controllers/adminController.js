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
  ReturnRequest,
  ProductView,
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
        model: OrderItem,
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

// Get comprehensive order analytics for Admin Console — 100% real data
const getOrderAnalytics = async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    let days = 30;
    if (range === '7d') days = 7;
    if (range === '90d') days = 90;
    if (range === '1y') days = 365;

    const now = new Date();
    const startDate = new Date(now); startDate.setDate(startDate.getDate() - days);
    const prevStartDate = new Date(startDate); prevStartDate.setDate(prevStartDate.getDate() - days);

    // ── Core metrics (parallel) ──────────────────────────────────────────────
    const [
      totalOrders, totalRevenue,
      prevTotalOrders, prevTotalRevenue,
      statusDistribution, trends, topProductsRaw, recentOrders,
      cancelledCount, totalReturnRequests,
      ordersWithActualDelivery, uniqueBuyerRows
    ] = await Promise.all([
      Order.count({ where: { createdAt: { [Op.gte]: startDate } } }),
      Order.sum('total', { where: { createdAt: { [Op.gte]: startDate } } }) || 0,
      Order.count({ where: { createdAt: { [Op.between]: [prevStartDate, startDate] } } }),
      Order.sum('total', { where: { createdAt: { [Op.between]: [prevStartDate, startDate] } } }) || 0,
      // Status breakdown
      Order.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'count']],
        where: { createdAt: { [Op.gte]: startDate } },
        group: ['status'], raw: true
      }),
      // Daily trends
      Order.findAll({
        attributes: [
          [fn('DATE', col('createdAt')), 'date'],
          [fn('COUNT', col('id')), 'orderCount'],
          [fn('SUM', col('total')), 'dailyRevenue']
        ],
        where: { createdAt: { [Op.gte]: startDate } },
        group: [fn('DATE', col('createdAt'))],
        order: [[fn('DATE', col('createdAt')), 'ASC']],
        raw: true
      }),
      // Top products
      OrderItem.findAll({
        attributes: [
          'productId',
          [fn('SUM', col('quantity')), 'totalSold'],
          [fn('SUM', literal('OrderItem.price * OrderItem.quantity')), 'totalRevenue']
        ],
        where: { createdAt: { [Op.gte]: startDate } },
        group: ['productId'],
        order: [[literal('totalSold'), 'DESC']],
        limit: 5,
        include: [{ model: Product, attributes: ['id', 'name', 'categoryId'] }]
      }),
      // Recent orders
      Order.findAll({
        limit: 10, order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }]
      }),
      // Cancellation count
      Order.count({ where: { createdAt: { [Op.gte]: startDate }, status: 'cancelled' } }),
      // Return requests (real)
      ReturnRequest.count({ where: { createdAt: { [Op.gte]: startDate } } }),
      // Orders with delivery timestamps for on-time rate
      Order.findAll({
        attributes: ['estimatedDelivery', 'actualDelivery'],
        where: {
          createdAt: { [Op.gte]: startDate },
          actualDelivery: { [Op.ne]: null },
          estimatedDelivery: { [Op.ne]: null }
        },
        raw: true
      }),
      // Unique buyers — for repeat purchase rate
      Order.findAll({
        attributes: ['userId', [fn('COUNT', col('id')), 'orderCount']],
        where: { createdAt: { [Op.gte]: startDate }, userId: { [Op.ne]: null } },
        group: ['userId'],
        raw: true
      })
    ]);

    // ── Growth ───────────────────────────────────────────────────────────────
    const safePrev = (v) => v || 1;
    const orderGrowth = parseFloat(((totalOrders - safePrev(prevTotalOrders)) / safePrev(prevTotalOrders) * 100).toFixed(1));
    const revenueGrowth = parseFloat(((totalRevenue - safePrev(prevTotalRevenue)) / safePrev(prevTotalRevenue) * 100).toFixed(1));
    const averageOrderValue = totalOrders > 0 ? parseFloat((totalRevenue / totalOrders).toFixed(2)) : 0;

    // ── Return Rate (real) ────────────────────────────────────────────────────
    const returnRate = totalOrders > 0 ? parseFloat(((totalReturnRequests / totalOrders) * 100).toFixed(1)) : 0;

    // ── Cancellation Rate (real) ──────────────────────────────────────────────
    const cancellationRate = totalOrders > 0 ? parseFloat(((cancelledCount / totalOrders) * 100).toFixed(1)) : 0;

    // ── Repeat Purchase Rate (real) ───────────────────────────────────────────
    const totalUniqueBuyers = uniqueBuyerRows.length;
    const repeatBuyers = uniqueBuyerRows.filter(r => parseInt(r.orderCount) >= 2).length;
    const repeatPurchaseRate = totalUniqueBuyers > 0
      ? parseFloat(((repeatBuyers / totalUniqueBuyers) * 100).toFixed(1))
      : 0;

    // ── On-time Delivery Rate (real) ──────────────────────────────────────────
    const onTimeCount = ordersWithActualDelivery.filter(o => new Date(o.actualDelivery) <= new Date(o.estimatedDelivery)).length;
    const onTimeDeliveryRate = ordersWithActualDelivery.length > 0
      ? parseFloat(((onTimeCount / ordersWithActualDelivery.length) * 100).toFixed(1))
      : null; // null = insufficient data

    // ── Fulfillment Timings (real, from lifecycle timestamps) ─────────────────
    const ordersWithTimings = await Order.findAll({
      attributes: ['createdAt', 'sellerConfirmedAt', 'pickedUpAt', 'actualDelivery'],
      where: {
        createdAt: { [Op.gte]: startDate },
        sellerConfirmedAt: { [Op.ne]: null },
        actualDelivery: { [Op.ne]: null }
      },
      raw: true
    });

    let avgProcessingHrs = null, avgTransitHrs = null, avgDeliveryHrs = null;
    if (ordersWithTimings.length > 0) {
      const toHours = (ms) => ms / (1000 * 60 * 60);
      const processingSamples = ordersWithTimings
        .filter(o => o.sellerConfirmedAt)
        .map(o => toHours(new Date(o.sellerConfirmedAt) - new Date(o.createdAt)))
        .filter(h => h > 0 && h < 720); // cap at 30 days to filter outliers
      const transitSamples = ordersWithTimings
        .filter(o => o.pickedUpAt && o.sellerConfirmedAt)
        .map(o => toHours(new Date(o.pickedUpAt) - new Date(o.sellerConfirmedAt)))
        .filter(h => h > 0 && h < 720);
      const deliverySamples = ordersWithTimings
        .filter(o => o.actualDelivery && o.pickedUpAt)
        .map(o => toHours(new Date(o.actualDelivery) - new Date(o.pickedUpAt)))
        .filter(h => h > 0 && h < 720);

      const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      avgProcessingHrs = processingSamples.length ? parseFloat(avg(processingSamples).toFixed(1)) : null;
      avgTransitHrs = transitSamples.length ? parseFloat(avg(transitSamples).toFixed(1)) : null;
      avgDeliveryHrs = deliverySamples.length ? parseFloat(avg(deliverySamples).toFixed(1)) : null;
    }

    const fulfillmentStats = {
      picking: avgProcessingHrs,
      packing: avgTransitHrs,
      shipping: avgDeliveryHrs,
      total: (avgProcessingHrs || 0) + (avgTransitHrs || 0) + (avgDeliveryHrs || 0) || null
    };

    // ── Top Regions (real, parsed from deliveryAddress) ───────────────────────
    const ordersWithAddress = await Order.findAll({
      attributes: ['deliveryAddress', 'marketingDeliveryAddress'],
      where: { createdAt: { [Op.gte]: startDate } },
      raw: true
    });

    // Common Kenyan cities/towns to extract
    const KENYAN_CITIES = [
      'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi',
      'Kitale', 'Garissa', 'Kakamega', 'Nyeri', 'Machakos', 'Meru', 'Embu',
      'Kericho', 'Kisii', 'Migori', 'Homa Bay', 'Siaya', 'Vihiga', 'Bungoma',
      'Trans Nzoia', 'Uasin Gishu', 'Nandi', 'Laikipia', 'Samburu', 'Isiolo',
      'Marsabit', 'Mandera', 'Wajir', 'Tana River', 'Lamu', 'Kilifi', 'Kwale',
      'Taita Taveta', 'Kajiado', 'Makueni', 'Kitui', 'Tharaka Nithi', 'Kirinyaga',
      'Murang\'a', 'Kiambu', 'Nyandarua', 'Nyamira', 'Bomet', 'Narok', 'Baringo'
    ];

    const regionCounts = {};
    for (const order of ordersWithAddress) {
      const addr = (order.deliveryAddress || order.marketingDeliveryAddress || '').toLowerCase();
      let matched = false;
      for (const city of KENYAN_CITIES) {
        if (addr.includes(city.toLowerCase())) {
          regionCounts[city] = (regionCounts[city] || 0) + 1;
          matched = true;
          break;
        }
      }
      if (!matched) {
        regionCounts['Other'] = (regionCounts['Other'] || 0) + 1;
      }
    }

    const topRegions = Object.entries(regionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([region, orderCount]) => ({ region, orderCount }));

    // ── Conversion Rate (real: orders / unique product view sessions) ─────────
    const [uniqueViewSessions, ordersFromViewers] = await Promise.all([
      ProductView.count({
        distinct: true, col: 'sessionId',
        where: { createdAt: { [Op.gte]: startDate }, sessionId: { [Op.ne]: null } }
      }),
      Order.count({
        where: {
          createdAt: { [Op.gte]: startDate },
          userId: { [Op.ne]: null }
        }
      })
    ]);
    const conversionRate = uniqueViewSessions > 0
      ? parseFloat(((ordersFromViewers / uniqueViewSessions) * 100).toFixed(2))
      : null;

    // ── Cohort Data — real monthly new vs returning customers ─────────────────
    const cohortMonths = 4;
    const cohortData = [];
    for (let i = cohortMonths - 1; i >= 0; i--) {
      const mStart = new Date(now); mStart.setMonth(mStart.getMonth() - i); mStart.setDate(1); mStart.setHours(0,0,0,0);
      const mEnd = new Date(mStart); mEnd.setMonth(mEnd.getMonth() + 1);
      const monthLabel = mStart.toLocaleString('default', { month: 'short' });

      // All buyers in this month
      const monthOrders = await Order.findAll({
        attributes: ['userId'],
        where: { createdAt: { [Op.between]: [mStart, mEnd] }, userId: { [Op.ne]: null } },
        raw: true
      });
      const monthBuyerIds = [...new Set(monthOrders.map(o => o.userId))];

      // Count how many had an order BEFORE this month
      const returningCount = await Order.count({
        where: {
          userId: { [Op.in]: monthBuyerIds.length ? monthBuyerIds : [0] },
          createdAt: { [Op.lt]: mStart }
        },
        distinct: true, col: 'userId'
      });

      const newCount = monthBuyerIds.length - returningCount;
      cohortData.push({ month: monthLabel, new: Math.max(0, newCount), returning: returningCount });
    }

    // ── Top products ─────────────────────────────────────────────────────────
    const topProducts = topProductsRaw.map(item => ({
      id: item.productId,
      name: item.Product?.name || 'Unknown Product',
      categoryId: item.Product?.categoryId,
      totalSold: parseInt(item.dataValues.totalSold) || 0,
      totalRevenue: parseFloat(item.dataValues.totalRevenue) || 0
    }));

    res.json({
      // Core
      totalOrders, orderGrowth, totalRevenue, revenueGrowth, averageOrderValue,
      // Status
      statusDistribution,
      // Products & Orders
      topProducts, recentOrders,
      // Trends
      revenueTrend: trends.map(t => parseFloat(t.dailyRevenue) || 0),
      orderTrend: trends.map(t => parseInt(t.orderCount) || 0),
      labels: trends.map(t => t.date),
      // Real advanced metrics
      returnRate,
      cancellationRate,
      repeatPurchaseRate,
      onTimeDeliveryRate,
      conversionRate,
      fulfillmentStats,
      topRegions,
      cohortData,
      // Metadata
      dataQuality: {
        onTimeDeliverySampleSize: ordersWithActualDelivery.length,
        fulfillmentSampleSize: ordersWithTimings.length,
        conversionSessionCount: uniqueViewSessions
      }
    });

  } catch (error) {
    console.error('Order Analytics Error:', error);
    res.status(500).json({ message: 'Error fetching order analytics', error: error.message });
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
    } else if (status === 'deleted') {
      where.deletedAt = { [Op.ne]: null };
    }

    const isSqlite = sequelize.options.dialect === 'sqlite';
    const textCast = isSqlite ? 'TEXT' : 'CHAR';
    const quote = isSqlite ? '"' : '`';

    console.error(`[getAllUsers] Debug: Starting query with limit=${limitNum}, dialect=${sequelize.options.dialect}`);

    const { count, rows: userRows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: offset,
      paranoid: status !== 'deleted' // Must set to false to see deleted records
    });

    // Safely fetch additional statistics for each user in parallel
    const users = await Promise.all(userRows.map(async (userRow) => {
      const user = userRow.get({ plain: true });
      
      // Initialize stats
      user.referralCount = 0;
      user.totalCommission = 0;

      // Only calculate for marketers or users with referral codes
      if (user.referralCode) {
        try {
          // 1. Calculate unique referrals (Users + Orders)
          const [directRefs, orderUserRefs, orderGuestRefs] = await Promise.all([
            User.count({ where: { referredByReferralCode: user.referralCode } }),
            Order.count({ distinct: true, col: 'userId', where: { marketerId: user.id, userId: { [Op.ne]: null } } }),
            Order.count({ distinct: true, col: 'customerEmail', where: { marketerId: user.id, userId: null, customerEmail: { [Op.ne]: null } } })
          ]);
          
          user.referralCount = directRefs + orderUserRefs + orderGuestRefs;

          // 2. Calculate Commissions
          const commSum = await Commission.sum('commissionAmount', { 
            where: { marketerId: user.id, status: { [Op.ne]: 'cancelled' } } 
          });
          user.totalCommission = parseFloat(commSum || 0);
        } catch (statError) {
          console.error(`[getAllUsers] Error fetching stats for user ${user.id}:`, statError.message);
        }
      }
      
      return user;
    }));

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

    console.error(`[getAllUsers] Debug: Query completed. Found ${users.length} users.`);

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

// Delete User (Soft Delete due to paranoid model)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Safety check: Prevent deleting self or other superadmins if not a superadmin
    const isSuperAdmin = req.user?.role === 'super_admin' || req.user?.roles?.includes('super_admin');
    const targetIsSuperAdmin = user.role === 'super_admin' || user.roles?.includes('super_admin');
    
    if (targetIsSuperAdmin && !isSuperAdmin) {
      return res.status(403).json({ message: 'Only a super admin can delete another super admin' });
    }

    if (user.id === req.user?.id) {
      return res.status(400).json({ message: 'You cannot delete your own account while logged in' });
    }

    await user.destroy();
    res.json({ message: 'User archived successfully' });
  } catch (e) {
    console.error('[adminController] Error deleting user:', e);
    res.status(500).json({ message: 'Error deleting user', error: e.message });
  }
};

// Restore User (Recover from Soft Delete)
const restoreUser = async (req, res) => {
  try {
    const { userId } = req.params;
    // We must use paranoid: false to find the deleted user
    const user = await User.findByPk(userId, { paranoid: false });
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.deletedAt) return res.status(400).json({ message: 'User is not archived' });

    await user.restore();
    res.json({ message: 'User restored successfully', user });
  } catch (e) {
    console.error('[adminController] Error restoring user:', e);
    res.status(500).json({ message: 'Error restoring user', error: e.message });
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

const { moveToSuccess } = require('../utils/walletHelpers');
const { Wallet, Transaction: WalletTransaction } = require('../models');

const bulkPayCommissions = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: 'ids array required' });
    }

    const commissions = await Commission.findAll({
      where: { id: ids, status: 'pending' },
      include: [{ model: Order, as: 'Order' }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let updatedCount = 0;
    for (const comm of commissions) {
      // 1. Move from Pending to Success Balance (if not already done by delivery logic)
      // Note: moveToSuccess is idempotent and uses atomic increments
      await moveToSuccess(
        comm.marketerId, 
        comm.commissionAmount, 
        comm.Order?.orderNumber || 'MANUAL', 
        'Commission Earning (Manual Payout)', 
        comm.orderId, 
        t, 
        'marketer'
      );

      // 2. Update status to paid
      await comm.update({ 
        status: 'paid', 
        paidAt: new Date() 
      }, { transaction: t });
      
      updatedCount++;
    }

    await t.commit();
    res.json({ message: 'Bulk pay completed', updated: updatedCount });
  } catch (e) {
    if (t) await t.rollback();
    console.error('[bulkPayCommissions ERROR]:', e);
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

    const marketersRows = await User.findAll({
      where: { role: 'marketer' },
      attributes: { exclude: ['password'] }
    });

    const marketers = await Promise.all(marketersRows.map(async (userRow) => {
      const user = userRow.get({ plain: true });
      
      user.referralCount = 0;
      user.totalCommission = 0;
      user.totalRevenue = 0;

      if (user.referralCode) {
        try {
          // 1. Calculate unique referrals
          const [directRefs, orderUserRefs, orderGuestRefs] = await Promise.all([
            User.count({ where: { referredByReferralCode: user.referralCode } }),
            Order.count({ distinct: true, col: 'userId', where: { marketerId: user.id, userId: { [Op.ne]: null } } }),
            Order.count({ distinct: true, col: 'customerEmail', where: { marketerId: user.id, userId: null, customerEmail: { [Op.ne]: null } } })
          ]);
          user.referralCount = directRefs + orderUserRefs + orderGuestRefs;

          // 2. Commissions & Revenue
          const [commSum, revSum] = await Promise.all([
            Commission.sum('commissionAmount', { where: { marketerId: user.id, status: { [Op.ne]: 'cancelled' } } }),
            Order.sum('total', { where: { marketerId: user.id, status: { [Op.notIn]: ['cancelled', 'failed'] } } })
          ]);
          
          user.totalCommission = parseFloat(commSum || 0);
          user.totalRevenue = parseFloat(revSum || 0);
        } catch (statError) {
          console.error(`[listMarketers] Error fetching stats for user ${user.id}:`, statError.message);
        }
      }
      
      return user;
    }));

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
  getOrderAnalytics,
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
  restoreUser,
  getSearchAnalytics,
  verifyAdminPassword,
  getRevenueAnalytics,
  getPlatformWalletDetails,
  withdrawPlatformFunds
};

