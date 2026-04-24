const { Op } = require('sequelize');
const { Product, Category, Order, OrderItem, User, FastFood, DeliveryTask, Warehouse, PickupStation, Batch } = require('../models/index');

const getMyProducts = async (req, res, next) => {
  console.log(`[getMyProducts] User: ${req?.user?.id} Query: ${JSON.stringify(req.query)}`);
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '1000', 10)));
    const { approved, reviewStatus } = req.query;

    const where = { sellerId: req.user.id };
    if (approved !== undefined) where.approved = approved === 'true';
    if (reviewStatus) where.reviewStatus = reviewStatus;

    const { count, rows } = await Product.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      attributes: [
        'id', 'name', 'basePrice', 'displayPrice', 'discountPrice', 'price',
        'coverImage', 'galleryImages', 'stock', 'approved', 'hasBeenApproved', 'reviewStatus',
        'reviewNotes', 'isActive', 'isFeatured', 'featured',
        'categoryId', 'subcategoryId', 'sellerId', 'createdAt', 'updatedAt',
        'keyFeatures', 'specifications', 'deliveryFee'
      ],
      raw: true
    });

    const sanitized = rows.map((plain) => {
      // Build images array
      const images = [];
      if (plain.coverImage) images.push(plain.coverImage);
      if (plain.galleryImages) {
        try {
          const gallery = typeof plain.galleryImages === 'string'
            ? JSON.parse(plain.galleryImages)
            : plain.galleryImages;
          if (Array.isArray(gallery)) images.push(...gallery);
        } catch (e) { }
      }
      plain.images = images;

      // Normalize keyFeatures - Single-pass efficient parsing
      if (plain.keyFeatures) {
        try {
          let kf = plain.keyFeatures;
          if (typeof kf === 'string') {
            try { kf = JSON.parse(kf); } catch { }
          }
          if (Array.isArray(kf)) {
            plain.keyFeatures = kf
              .map(item => {
                let v = item;
                if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('"'))) {
                  try { v = JSON.parse(v); } catch { }
                }
                return Array.isArray(v) ? v : [v];
              })
              .flat(Infinity)
              .map(x => String(x).replace(/^["[\]]+|["[\]]+$/g, '').trim())
              .filter(Boolean);
          }
        } catch (e) { }
      }
      return plain;
    });

    console.log(`[getMyProducts] Sending ${sanitized.length} of ${count} products`);
    res.json({
      data: sanitized,
      meta: {
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize)
      }
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/seller/kpis
const getMyKpis = async (req, res, next) => {
  const start = Date.now();
  console.log(`[getMyKpis] Start for user: ${req?.user?.id}`);
  try {
    const userId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const pendingStatuses = ['order_placed', 'seller_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'processing', 'at_warehouse', 'super_admin_confirmed', 'ready_for_pickup', 'in_transit'];
    const paidStatuses = ['paid', 'delivered', 'completed'];

    // FAST PATH: Use indexed Order.sellerId for direct queries — no OrderItem join needed for KPI counts
    const [
      lowStockCount,
      awaitingProducts,
      rejectedProducts,
      awaitingMeals,
      rejectedMeals,
      pendingOrdersCount,
      todayPaidOrders
    ] = await Promise.all([
      Product.count({ where: { sellerId: userId, stock: { [Op.lte]: 3 } } }),
      Product.count({ where: { sellerId: userId, approved: false, reviewStatus: { [Op.or]: ['pending', 'awaiting_approval'] } } }),
      Product.count({ where: { sellerId: userId, reviewStatus: 'rejected' } }),
      FastFood.count({ where: { vendor: userId, approved: false, reviewStatus: { [Op.or]: ['pending', 'awaiting_approval'] } } }),
      FastFood.count({ where: { vendor: userId, reviewStatus: 'rejected' } }),
      // Direct indexed query on Order.sellerId — immediate
      Order.count({ where: { sellerId: userId, status: { [Op.in]: pendingStatuses } } }),
      // Today's paid orders via indexed sellerId + status + date
      Order.findAll({
        where: {
          sellerId: userId,
          status: { [Op.in]: paidStatuses },
          createdAt: { [Op.between]: [todayStart, todayEnd] }
        },
        attributes: ['id', 'total'],
        raw: true
      })
    ]);

    const todayEarnings = todayPaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    console.log(`[getMyKpis] Done in ${Date.now() - start}ms (Pending: ${pendingOrdersCount}, Today: ${todayEarnings})`);
    res.json({
      todayEarnings,
      pendingOrdersCount,
      lowStockCount,
      awaitingApprovalCount: awaitingProducts + awaitingMeals,
      rejectedCount: rejectedProducts + rejectedMeals
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/seller/products/:id
const getMyProductById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      console.error('Invalid product ID:', req.params.id);
      return res.status(400).json({ message: 'Invalid product id' });
    }

    console.log('Fetching product:', { id, sellerId: req.user.id });

    const row = await Product.findOne({
      where: { id, sellerId: req.user.id },
      include: [
        {
          model: Category,
          as: 'category',
          required: false
        }
      ]
    });

    console.log('Product query result:', row ? 'Found' : 'Not found');

    if (!row) {
      console.log('Product not found or not owned by seller:', { id, sellerId: req.user.id });
      return res.status(404).json({ message: 'Product not found' });
    }

    const plain = row.get({ plain: true });

    // Construct images array for frontend compatibility
    const images = [];
    if (plain.coverImage) images.push(plain.coverImage);
    if (plain.galleryImages) {
      try {
        const gallery = typeof plain.galleryImages === 'string' ? JSON.parse(plain.galleryImages) : plain.galleryImages;
        if (Array.isArray(gallery)) images.push(...gallery);
      } catch (e) {
        console.warn('Failed to parse galleryImages', e);
      }
    }
    plain.images = images;

    // Normalize keyFeatures: deeply unwrap any nested JSON stringification
    const deepUnwrapArray = (val) => {
      let current = val;
      for (let i = 0; i < 10; i++) {
        if (typeof current !== 'string') break;
        const t = current.trim();
        if (!(t.startsWith('[') || t.startsWith('"'))) break;
        try { current = JSON.parse(t); } catch { break; }
      }
      return current;
    };

    const normalizeKeyFeatures = (raw) => {
      let unwrapped = deepUnwrapArray(raw);
      if (Array.isArray(unwrapped)) {
        return unwrapped
          .map(item => deepUnwrapArray(item))
          .flat(Infinity)
          .map(item => String(item).replace(/^["\[\]]+|["\[\]]+$/g, '').trim())
          .filter(Boolean);
      }
      if (typeof unwrapped === 'string' && unwrapped.trim()) {
        return [unwrapped.replace(/^["\[\]]+|["\[\]]+$/g, '').trim()];
      }
      return [];
    };

    plain.keyFeatures = normalizeKeyFeatures(plain.keyFeatures);

    res.json(plain);
  } catch (e) {
    next(e);
  }
};

// PATCH /api/seller/products/:id
const updateMyProduct = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid product id' })
    const row = await Product.findOne({ where: { id, sellerId: req.user.id } })
    if (!row) return res.status(404).json({ message: 'Product not found' })

    const body = req.body || {}
    const updates = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.basePrice !== undefined) updates.basePrice = parseFloat(body.basePrice)
    if (body.stock !== undefined) updates.stock = parseInt(body.stock, 10)
    if (body.categoryId !== undefined) updates.categoryId = parseInt(body.categoryId, 10)
    // We'll merge tags later to include media

    // Images handling:
    // - If client sends existingImages (JSON array), start from that list.
    // - If files uploaded, append new images to that list.
    // - If neither existingImages nor files provided, keep current images unchanged.
    const files = req.files || {}
    let existingImages
    if (body.existingImages !== undefined) {
      try { existingImages = JSON.parse(body.existingImages) } catch { existingImages = undefined }
    }
    const coverFiles = Array.isArray(files.cover) ? files.cover : []
    const galleryFiles = Array.isArray(files.gallery) ? files.gallery : []
    const newImageUrls = [
      ...coverFiles.map(f => `/uploads/products/${f.filename}`),
      ...galleryFiles.map(f => `/uploads/products/${f.filename}`)
    ]
    if (existingImages && Array.isArray(existingImages)) {
      updates.images = [...existingImages, ...newImageUrls]
    } else if (newImageUrls.length > 0) {
      updates.images = newImageUrls
    }

    // Before saving, block duplicates if name/categoryId would collide
    const nextName = updates.name ?? row.name
    const nextCategoryId = updates.categoryId ?? row.categoryId
    if (nextName && nextCategoryId) {
      const { fn, col, where: sqlWhere } = Product.sequelize
      const exists = await Product.findOne({
        where: {
          sellerId: req.user.id,
          categoryId: nextCategoryId,
          id: { [Op.ne]: row.id },
          [fn('LOWER', col('name'))]: {
            [Op.like]: `%${String(nextName).toLowerCase()}%`
          }
        }
      })
      if (exists) {
        return res.status(409).json({ code: 'DUPLICATE_PRODUCT', message: 'You already have a product with this name in the selected category.' })
      }
    }

    // Merge tags and add media info (video)
    let currentTags = {}
    try { currentTags = (row.tags && typeof row.tags === 'object') ? row.tags : {} } catch { }
    if (body.tags !== undefined) {
      try {
        const incoming = JSON.parse(body.tags)
        if (incoming && typeof incoming === 'object') currentTags = { ...currentTags, ...incoming }
      } catch { /* ignore */ }
    }
    const videoFiles = Array.isArray(files.video) ? files.video : []
    const media = { ...(currentTags.media || {}) }
    if (videoFiles.length > 0) media.videoPath = `/uploads/products/${videoFiles[0].filename}`
    if (body.videoUrl) media.videoUrl = String(body.videoUrl)
    if (Object.keys(media).length > 0) currentTags.media = media
    updates.tags = currentTags

    // Flags to control status
    const isDraft = ['1', 'true', true].includes((body.draft ?? '').toString().toLowerCase())
    const isSubmit = ['1', 'true', true].includes((body.submit ?? '').toString().toLowerCase())
    if (isDraft) {
      updates.reviewStatus = 'draft'
      updates.approved = false
    } else if (isSubmit) {
      updates.reviewStatus = 'pending'
      updates.approved = false
    } else {
      // default: any edit requires re-approval if previously approved
      updates.reviewStatus = 'pending'
      updates.approved = false
    }

    await row.update(updates)
    res.json({ message: 'Product updated. Await admin review.', product: row })
  } catch (e) {
    next(e);
  }
};

// Helper to find all order IDs where a user has at least one item
const getSellersItemOrderIds = async (userId) => {
  try {
    // Fast path for unified orders: OrderItem.sellerId is now populated.
    const directItems = await OrderItem.findAll({
      attributes: ['orderId'],
      where: { sellerId: userId },
      raw: true
    });

    const directOrderIds = Array.from(new Set(directItems.map(it => it.orderId)));

    // Legacy fallback for historical items that may not have sellerId populated.
    const [pIds, fIds] = await Promise.all([
      Product.findAll({ where: { sellerId: userId }, attributes: ['id'], raw: true }).then(rows => rows.map(r => r.id)),
      FastFood.findAll({ where: { vendor: userId }, attributes: ['id'], raw: true }).then(rows => rows.map(r => r.id))
    ]);

    if (pIds.length === 0 && fIds.length === 0) return directOrderIds;

    const legacyItems = await OrderItem.findAll({
      attributes: ['orderId'],
      where: {
        [Op.or]: [
          { productId: { [Op.in]: pIds } },
          { fastFoodId: { [Op.in]: fIds } }
        ]
      },
      raw: true
    });

    const legacyOrderIds = legacyItems.map(it => it.orderId);
    return Array.from(new Set([...directOrderIds, ...legacyOrderIds]));
  } catch (err) {
    console.error('[getSellersItemOrderIds] Error:', err);
    return [];
  }
};

// GET /api/seller/orders
const getMyOrders = async (req, res, next) => {
  console.log(`[getMyOrders] User: ${req?.user?.id} Query: ${JSON.stringify(req.query)}`);
  const startTime = Date.now();
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '1000', 10)));
    const { status } = req.query;

    const myItemOrderIds = await getSellersItemOrderIds(userId);

    const orderOr = [{ sellerId: userId }];
    if (myItemOrderIds.length > 0) {
      orderOr.push({ id: { [Op.in]: myItemOrderIds } });
    }

    const orderWhere = { [Op.or]: orderOr };

    if (status) {
      const statusArray = Array.isArray(status) ? status : status.split(',').map(s => s.trim().toLowerCase());
      orderWhere.status = { [Op.in]: statusArray };
    }

    const startIdFetch = Date.now();
    const totalCount = await Order.count({ where: orderWhere });

    console.log(`[getMyOrders] Found ${totalCount} orders in ${Date.now() - startIdFetch}ms`);

    if (totalCount === 0) {
      return res.json({ data: [], meta: { total: 0, page, pageSize, totalPages: 0 } });
    }

    const rows = await Order.findAll({
      where: orderWhere,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      include: [
        {
          model: OrderItem,
          as: 'OrderItems',
          include: [
            {
              model: Product,
              required: false,
              attributes: ['id', 'name', 'coverImage', 'basePrice', 'sellerId'],
              include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'businessName'] }]
            },
            {
              model: FastFood,
              required: false,
              attributes: ['id', 'name', 'mainImage', 'basePrice', 'vendor'],
              include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'businessName'] }]
            }
          ]
        },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
        {
          model: DeliveryTask,
          as: 'deliveryTasks',
          required: false,
          attributes: ['id', 'status', 'deliveryType', 'orderId', 'deliveryAgentId'],
          include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone', 'businessName'] }]
        },
        { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'contactPhone'] },
        { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name'] },
        // Admin routing destinations
        { model: Warehouse, as: 'DestinationWarehouse', attributes: ['id', 'name', 'address', 'landmark', 'contactPhone'] },
        { model: PickupStation, as: 'DestinationPickStation', attributes: ['id', 'name', 'location', 'contactPhone'] },
        { model: Batch, as: 'batch' }
      ]
    });

    console.log(`[getMyOrders] Query completed in ${Date.now() - startTime}ms`);

    const result = rows.map(o => {
      const json = o.toJSON();
      const items = json.OrderItems || [];

      let sellerTotal = 0;
      const myItems = items.filter(it => {
        const isMyByItemSeller = String(it.sellerId || '') === String(userId);
        const isMyProduct = it.Product && String(it.Product.sellerId) === String(userId);
        const isMyMeal = it.FastFood && String(it.FastFood.vendor) === String(userId);
        if (isMyByItemSeller || isMyProduct || isMyMeal) {
          const bp = Number(it.Product?.basePrice || it.FastFood?.basePrice || 0);
          sellerTotal += (bp * (it.quantity || 0));
          return true;
        }
        return false;
      });

      json.OrderItems = myItems;
      json.sellerTotal = sellerTotal;

      // Privacy scrubbing
      if (json.deliveryTasks) {
        json.deliveryTasks = json.deliveryTasks.map(task => {
          const isSellerLeg = ['seller_to_warehouse', 'seller_to_customer', 'warehouse_to_seller', 'customer_to_seller'].includes(task.deliveryType);
          if (!isSellerLeg && task.deliveryAgent) {
            return { ...task, deliveryAgent: { id: task.deliveryAgent.id, name: 'System Agent', role: 'delivery_agent' } };
          }
          return task;
        });
      }

      if (json.user && json.deliveryType !== 'seller_to_customer') {
        const scrubbed = { ...json.user };
        delete scrubbed.email;
        delete scrubbed.phone;
        json.user = scrubbed;
      }

      return json;
    });

    // Debug ORD-1772532569056-835
    const debugTarget = result.find(r => r.orderNumber === 'ORD-1772532569056-835');
    if (debugTarget) {
      console.log('--- DEBUG ORD-1772532569056-835 metadata ---');
      console.log('SellerTotal:', debugTarget.sellerTotal);
      console.log('OrderItems count:', debugTarget.OrderItems?.length);
      console.log('Has Seller Object:', !!debugTarget.seller);
      console.log('Has User (Customer) Object:', !!debugTarget.user);
    }

    res.json({
      data: result,
      meta: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/seller/products/duplicate-check?name=...&categoryId=...
const duplicateCheck = async (req, res, next) => {
  try {
    const name = String(req.query.name || '').trim();
    const categoryId = parseInt(req.query.categoryId, 10);
    const excludeId = req.query.excludeId ? parseInt(req.query.excludeId, 10) : undefined;
    if (!name || isNaN(categoryId)) {
      return res.status(400).json({ message: 'Missing name or categoryId' });
    }
    const { fn, col } = Product.sequelize;
    const where = {
      sellerId: req.user.id,
      categoryId,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
    }
    const exists = await Product.findOne({
      where: {
        ...where,
        [fn('LOWER', col('name'))]: {
          [Op.like]: `%${String(name).toLowerCase()}%`
        }
      }
    });
    res.json({ duplicate: !!exists });
  } catch (e) {
    next(e);
  }
};

// GET /api/sellers/overview
const getOverview = async (req, res, next) => {
  const start = Date.now();
  const userId = req.user.id;
  console.log(`[getOverview] Start for user: ${userId}`);
  try {
    const previewSize = 6;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const pendingStatuses = ['order_placed', 'seller_confirmed', 'en_route_to_warehouse', 'at_warehouse', 'processing', 'at_warehouse', 'super_admin_confirmed', 'ready_for_pickup', 'in_transit'];
    const paidStatuses = ['paid', 'delivered', 'completed'];

    // 1. Find limited order IDs for overview
    const myItemOrderIds = await getSellersItemOrderIds(userId);

    const [
      products,
      fastFoods,
      recentOrders,
      lowStockCount,
      awaitingProducts,
      rejectedProducts,
      awaitingMeals,
      rejectedMeals,
      pendingOrdersCount,
      todayPaidOrders
    ] = await Promise.all([
      Product.findAll({
        where: { sellerId: userId },
        limit: previewSize,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'name', 'stock', 'approved', 'reviewStatus', 'basePrice', 'discountPrice', 'displayPrice', 'coverImage', 'galleryImages', 'createdAt', 'reviewNotes'],
        raw: true
      }),
      FastFood.findAll({
        where: { vendor: userId },
        limit: previewSize,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'name', 'approved', 'reviewStatus', 'basePrice', 'displayPrice', 'mainImage', 'createdAt', 'reviewNotes'],
        raw: true
      }),
      Order.findAll({
        where: {
          [Op.or]: [
            { sellerId: userId },
            { id: { [Op.in]: myItemOrderIds } }
          ]
        },
        limit: previewSize,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: OrderItem,
            as: 'OrderItems',
            include: [
              {
                model: Product,
                required: false,
                include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'businessName'] }]
              },
              {
                model: FastFood,
                required: false,
                include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name', 'businessName'] }]
              }
            ]
          },
          { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
          { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'businessName'] },
          {
            model: DeliveryTask,
            as: 'deliveryTasks',
            required: false,
            attributes: ['id', 'status', 'deliveryType', 'orderId', 'deliveryAgentId'],
            include: [{ model: User, as: 'deliveryAgent', attributes: ['id', 'name', 'phone', 'businessName'] }]
          },
          { model: Warehouse, as: 'Warehouse', attributes: ['id', 'name', 'address', 'contactPhone'] },
          { model: PickupStation, as: 'PickupStation', attributes: ['id', 'name'] },
          { model: Batch, as: 'batch' }
        ]
      }),
      Product.count({ where: { sellerId: userId, stock: { [Op.lte]: 3 } } }),
      Product.count({ where: { sellerId: userId, approved: false, reviewStatus: { [Op.or]: ['pending', 'awaiting_approval'] } } }),
      Product.count({ where: { sellerId: userId, reviewStatus: 'rejected' } }),
      FastFood.count({ where: { vendor: userId, approved: false, reviewStatus: { [Op.or]: ['pending', 'awaiting_approval'] } } }),
      FastFood.count({ where: { vendor: userId, reviewStatus: 'rejected' } }),
      Order.count({ where: { sellerId: userId, status: { [Op.in]: pendingStatuses } } }),
      Order.findAll({
        where: {
          [Op.or]: [
            { sellerId: userId },
            { id: { [Op.in]: myItemOrderIds } }
          ],
          status: { [Op.in]: paidStatuses },
          createdAt: { [Op.between]: [todayStart, todayEnd] }
        },
        include: [
          {
            model: OrderItem,
            as: 'OrderItems',
            include: [
              { model: Product, attributes: ['id', 'sellerId', 'basePrice'], required: false },
              { model: FastFood, attributes: ['id', 'vendor', 'basePrice'], required: false }
            ]
          }
        ]
      })
    ]);

    const ordersWithTotal = recentOrders.map(o => {
      const json = o.toJSON();
      let sellerTotal = 0;
      const myItems = (json.OrderItems || []).filter(it => {
        const isMyProduct = it.Product && String(it.Product.sellerId) === String(userId);
        const isMyMeal = it.FastFood && String(it.FastFood.vendor) === String(userId);
        if (isMyProduct || isMyMeal) {
          sellerTotal += (Number(it.Product?.basePrice || it.FastFood?.basePrice || 0) * (it.quantity || 0));
          return true;
        }
        return false;
      });

      json.OrderItems = myItems;
      json.sellerTotal = sellerTotal;

      // Privacy scrubbing
      if (json.deliveryTasks) {
        json.deliveryTasks = json.deliveryTasks.map(task => {
          const isSellerLeg = ['seller_to_warehouse', 'seller_to_customer', 'warehouse_to_seller', 'customer_to_seller'].includes(task.deliveryType);
          if (!isSellerLeg && task.deliveryAgent) {
            return { ...task, deliveryAgent: { id: task.deliveryAgent.id, name: 'System Agent', role: 'delivery_agent' } };
          }
          return task;
        });
      }

      if (json.user && json.deliveryType !== 'seller_to_customer') {
        const scrubbed = { ...json.user };
        delete scrubbed.email;
        delete scrubbed.phone;
        json.user = scrubbed;
      }
      return json;
    });

    // Calculate today's earnings accurately by summing sellerTotal for today's orders
    let todayEarnings = 0;
    todayPaidOrders.forEach(o => {
      (o.OrderItems || []).forEach(it => {
        const isMyProduct = it.Product && String(it.Product.sellerId) === String(userId);
        const isMyMeal = it.FastFood && String(it.FastFood.vendor) === String(userId);
        if (isMyProduct || isMyMeal) {
          todayEarnings += (Number(it.Product?.basePrice || it.FastFood?.basePrice || 0) * (it.quantity || 0));
        }
      });
    });

    const productsNormalized = products.map(p => {
      const images = [];
      if (p.coverImage) images.push(p.coverImage);
      try {
        const gallery = typeof p.galleryImages === 'string' ? JSON.parse(p.galleryImages) : (p.galleryImages || []);
        if (Array.isArray(gallery)) images.push(...gallery);
      } catch { }
      return { ...p, images };
    });

    console.log(`[getOverview] Done in ${Date.now() - start}ms`);
    res.json({
      products: productsNormalized,
      fastFoods,
      orders: ordersWithTotal,
      kpis: {
        todayEarnings,
        pendingOrdersCount,
        lowStockCount,
        awaitingApprovalCount: awaitingProducts + awaitingMeals,
        rejectedCount: rejectedProducts + rejectedMeals
      }
    });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getMyProducts,
  getMyKpis,
  getMyProductById,
  updateMyProduct,
  getMyOrders,
  duplicateCheck,
  getOverview
};
