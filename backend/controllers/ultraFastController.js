const { Op } = require('sequelize');
const { Product, User, Category, Service, ServiceImage, FastFood, HeroPromotion, sequelize } = require('../models');
const cacheService = require('../scripts/services/cacheService');

const isInlineImageData = (value) => typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image');

const getListSafeImage = (value) => (isInlineImageData(value) ? null : value || null);

const getUltraFastHomepageProducts = async (req, res) => {
  const startTime = Date.now();

  try {

    // Generate cache key based on parameters
    const isMarketing = req.query.marketing === 'true';
    const cacheKey = `homepage:ultra-fast:${req.query.limit || 8}:${req.query.page || 1}:${isMarketing ? 'marketing' : 'standard'}`;

    // Try to get from cache first
    const ignoreCache = req.query.ignoreCache === 'true';
    const cachedData = ignoreCache ? null : await cacheService.get(cacheKey);
    if (cachedData) {
      const responseTime = Date.now() - startTime;
      console.log(`[UltraFastHomepage] Cache hit in ${responseTime}ms`);

      // Add performance headers
      res.set({
        'X-Cache': 'HIT',
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache-Type': 'redis'
      });

      return res.status(200).json(cachedData);
    }

    const whereClause = {
      approved: true,
      visibilityStatus: 'visible',
      suspended: false,
      isActive: true,
      status: 'active'
    };

    if (isMarketing) {
      whereClause.marketingEnabled = true;
      whereClause.marketingCommission = { [Op.gt]: 1 };
    }

    // Get total count for pagination (same as regular endpoint)
    const totalCount = await Product.count({
      where: whereClause
    });

    // Ultra-optimized query with minimal data transfer
    const limit = Math.min(parseInt(req.query.limit) || 24, 50); // Load 24 by default for 4 rows
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    console.log(`[UltraFast] Request - Marketing: ${isMarketing}, CommFilter: ${JSON.stringify(whereClause.marketingCommission)}`);

    // Ultra-optimized query with minimal data transfer
    const products = await Product.findAll({
      where: whereClause,
      attributes: [
        'id',
        'name',
        'shortDescription',
        'basePrice',
        'displayPrice',
        'discountPrice',
        'discountPercentage',
        'categoryId',
        'subcategoryId',
        'coverImage',
        'galleryImages',
        'images',
        'deliveryFee',
        'marketingCommission',
        'marketingCommissionType',
        'variants',
        'createdAt',
        'updatedAt'
      ],
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'businessName'],
          required: false,
          where: {
            role: { [Op.in]: ['superadmin', 'admin'] }
          }
        }
      ],
      order: [
        // Super admin products first, then by creation date
        [{ model: User, as: 'seller' }, 'role', 'ASC'],
        ['createdAt', 'DESC']
      ],
      limit: limit,
      offset: offset,
      subQuery: false // Disable subquery for better performance
    });

    // Minimal processing - only essential data
    const sanitizedProducts = products.map(product => {
      const plain = product.get({ plain: true });

      // Only keep essential fields with proper image handling
      return {
        id: plain.id,
        name: plain.name,
        shortDescription: plain.shortDescription,
        basePrice: plain.basePrice,
        displayPrice: plain.displayPrice || plain.basePrice || 0,
        discountPrice: plain.discountPrice,
        price: plain.discountPrice || plain.displayPrice || plain.basePrice || 0,
        discountPercentage: plain.discountPercentage || 0,
        categoryId: plain.categoryId,
        subcategoryId: plain.subcategoryId,
        // Properly handle images (reconstruct array from single cover image)
        coverImage: getListSafeImage(plain.coverImage),
        galleryImages: plain.galleryImages,
        images: plain.images || (getListSafeImage(plain.coverImage) ? [getListSafeImage(plain.coverImage)] : []),
        deliveryFee: plain.deliveryFee || 0,
        // Marketing fields
        marketingCommission: plain.marketingCommission,
        marketingCommissionType: plain.marketingCommissionType,
        variants: plain.variants || [],
        // Flag super admin products for the frontend
        isSuperAdminProduct: !!(plain.seller && ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase())),
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt
      };
    });

    const result = {
      products: sanitizedProducts,
      totalCount: totalCount,
      isUltraFastData: true,
      loadedAt: new Date().toISOString(),
      pagination: {
        page,
        limit,
        hasMore: products.length === limit,
        totalProducts: totalCount
      }
    };

    // Cache for 2 minutes (120 seconds) for homepage data
    await cacheService.set(cacheKey, result, 120);

    res.status(200).json(result);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('[UltraFastHomepage] Error:', error.message, `(${responseTime}ms)`);

    res.status(500).json({
      message: 'Server error while fetching ultra-fast homepage products.',
      error: error.message,
      responseTime: `${responseTime}ms`
    });
  }
};

// Batch endpoint for multiple data types in one request
const getHomepageBatchData = async (req, res) => {
  const startTime = Date.now();
  const isMarketing = req.query.marketing === 'true';

  try {
    // FORCE CACHE BUST FROM V8 -> V9
    const cacheKey = `homepage:batch:v9:${isMarketing ? 'marketing' : 'standard'}`;
    const ignoreCache = req.query.ignoreCache === 'true';
    const cachedData = ignoreCache ? null : await cacheService.get(cacheKey);
    if (cachedData) {
      const responseTime = Date.now() - startTime;
      res.set({
        'X-Cache': 'HIT',
        'X-Response-Time': `${responseTime}ms`,
        'X-Cache-Type': 'redis'
      });
      return res.status(200).json(cachedData);
    }

    // Debug logging
    console.log(`[Batch] Request - Marketing: ${isMarketing}, Query: ${JSON.stringify(req.query)}`);


    // Execute multiple queries in parallel for better performance
    // Wrapped in separate handlers for better debugging of 500 errors
    const fetchProductsData = async () => {
      try {
        const whereClause = {
          approved: true,
          visibilityStatus: 'visible',
          suspended: false,
          isActive: true,
          status: 'active'
        };

        if (isMarketing) {
          whereClause.marketingEnabled = true;
          whereClause.marketingCommission = { [Op.gt]: 1 };
        }

        const [results, totalCount] = await Promise.all([
          Product.findAll({
            where: whereClause,
            attributes: [
              'id', 'name', 'basePrice', 'displayPrice',
              'discountPrice', 'discountPercentage', 'stock',
              'categoryId', 'subcategoryId', 'createdAt',
              'coverImage', 'galleryImages', 'images',
              'deliveryFee',
              'marketingCommission', 'marketingCommissionType', 'approved',
              'variants',
              'price', // Include price if it exists in DB
              'visibilityStatus', 'suspended', 'isActive', 'status'
            ],
            include: [{
              model: User,
              as: 'seller',
              attributes: ['id', 'name', 'role', 'businessName'],
              required: false
            }],
            order: [['createdAt', 'DESC']],
            limit: 48,
            subQuery: false
          }),
          Product.count({ where: whereClause })
        ]);

        return { results, totalCount };
      } catch (err) {
        return { results: [], totalCount: 0 };
      }
    };

    const fetchCategories = async () => {
      try {
        const { Category, Subcategory, Product } = require('../models');

        // 1. Fetch base categories
        const categories = await Category.findAll({
          where: { parentId: null },
          attributes: ['id', 'name', 'emoji', 'slug'],
          include: [{
            model: Subcategory,
            as: 'Subcategory',
            attributes: ['id', 'name', 'emoji', 'slug']
          }],
          order: [['name', 'ASC']]
        });

        // 2. Fetch product counts in parallel (Aggregation)
        const productCounts = await Product.findAll({
          where: {
            approved: true,
            visibilityStatus: 'visible',
            suspended: false,
            isActive: true,
            status: 'active'
          },
          attributes: [
            'categoryId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['categoryId'],
          raw: true
        });

        // 3. Map counts to categories
        const countMap = {};
        productCounts.forEach(p => {
          countMap[p.categoryId] = parseInt(p.count || 0);
        });

        // 4. Merge data
        return categories.map(cat => {
          // Convert sequelize model to plain object if needed, though attributes usage typically implies structure
          const plain = cat.get({ plain: true });
          plain.productCount = countMap[plain.id] || 0;
          // We can skip subcategory count or fetch it similarly if critical, but usually product count is the bottleneck.
          // For now, setting subcategoryCount based on the loaded array length to save a query
          plain.subcategoryCount = plain.Subcategory ? plain.Subcategory.length : 0;
          return plain;
        });

      } catch (err) {
        console.error('[HomepageBatch] Categories query failed:', err.message);
        return [];
      }
    };

    const fetchServicesData = async () => {
      try {
        const whereClause = { status: { [Op.or]: ['approved', 'active'] } };
        
        if (isMarketing) {
          whereClause.marketingEnabled = true;
          whereClause.marketingCommission = { [Op.gt]: 1 };
        } else {
          whereClause.isAvailable = true;
        }

        const [services, totalCount] = await Promise.all([
          Service.findAll({
            where: whereClause,
            attributes: [
              'id', 'title', 'basePrice', 'displayPrice', 'rating', 'userId',
              'status', 'isAvailable', 'availabilityMode', 'availabilityDays',
              'location', 'vendorLocation', 'isFeatured', 'discountPercentage',
              'discountPrice', 'deliveryFee', 'marketingCommission', 'marketingCommissionType', 'marketingEnabled',
              'categoryId', 'subcategoryId', 'coverImage', 'description'
            ],
            include: [{
              model: ServiceImage,
              as: 'images',
              attributes: ['imageUrl'],
              limit: 1
            }],
            order: [['createdAt', 'DESC']],
            limit: 48
          }),
          Service.count({ where: whereClause })
        ]);
        console.log(`[HomepageBatch] Successfully found ${services.length} services (Total: ${totalCount})`);
        return { services, totalCount };
      } catch (err) {
        console.error('[HomepageBatch] Services query error:', err.message);
        return { services: [], totalCount: 0 };
      }
    };

    const fetchFastFoodData = async () => {
      try {
        const whereClause = { isActive: true, approved: true };

        if (isMarketing) {
          whereClause.marketingEnabled = true;
          whereClause.marketingCommission = { [Op.gt]: 1 };
          // No isAvailable check
        } else {
          whereClause.isAvailable = true;
        }

        const [items, totalCount] = await Promise.all([
          FastFood.findAll({
            where: whereClause,
            attributes: [
              'id', 'name', 'basePrice', 'displayPrice', 'mainImage', 'ratings',
              'vendor', 'isFeatured', 'isActive', 'isAvailable',
              'dietaryTags', 'kitchenVendor', 'vendorLocation', 'updatedAt',
              'discountPercentage', 'discountPrice', 'deliveryFee', 'marketingCommission', 'marketingCommissionType', 'marketingEnabled',
              'categoryId', 'subcategoryId', 'status'
            ],
            order: [['createdAt', 'DESC']],
            limit: 48
          }),
          FastFood.count({ where: whereClause })
        ]);
        return { items, totalCount };
      } catch (err) {
        console.error('[HomepageBatch] FastFood query failed:', err.message);
        return { items: [], totalCount: 0 };
      }
    };

    const [
      productsResult,
      categoriesResult,
      servicesResult,
      fastFoodResult,
      heroPromosResult
    ] = await Promise.all([
      (async () => {
        const start = Date.now();
        const res = await fetchProductsData();
        console.log(`⏱️ [Batch] Products fetched: ${res.results.length} (Marketing: ${isMarketing}) in ${Date.now() - start}ms`);
        return res;
      })(),
      (async () => {
        const start = Date.now();
        const res = await fetchCategories();
        console.log(`⏱️ [Batch] Categories fetched in ${Date.now() - start}ms`);
        return res;
      })(),
      (async () => {
        const start = Date.now();
        const res = await fetchServicesData();
        console.log(`⏱️ [Batch] Services fetched: ${res.services.length} (Marketing: ${isMarketing}) in ${Date.now() - start}ms`);
        return res;
      })(),
      (async () => {
        const start = Date.now();
        const res = await fetchFastFoodData();
        console.log(`⏱️ [Batch] FastFood fetched: ${res.items.length} (Marketing: ${isMarketing}) in ${Date.now() - start}ms`);
        return res;
      })(),
      // 5. Fetch real active hero promotions
      (async () => {
        try {
          const now = new Date();
          const items = await HeroPromotion.findAll({
            where: {
              status: { [Op.in]: ['active', 'scheduled'] },
              startAt: { [Op.lte]: now },
              endAt: { [Op.gte]: now }
            },
            order: [['startAt', 'ASC']],
            limit: 8 // increased limit slightly to allow for some filtering
          });

          const result = [];
          for (const p of items) {
            const promoData = p.toJSON();
            let populatedItems = [];

            if (p.promoType === 'fastfood') {
              const ids = p.fastFoodIds || [];
              const ffItems = await FastFood.findAll({
                where: { id: { [Op.in]: ids }, isActive: true, approved: true },
                attributes: [
                  'id', 'name', 'mainImage', 'displayPrice', 'discountPrice', 'basePrice', 'discountPercentage',
                  'marketingCommission', 'marketingEnabled', 'marketingCommissionType'
                ]
              });
              
              populatedItems = ffItems.map(item => {
                const plain = item.get({ plain: true });
                plain.coverImage = plain.mainImage;
                plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
                plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
                return plain;
              });
            } else {
              // Default to product
              const ids = p.productIds || [];
              const prods = await Product.findAll({
                where: { id: { [Op.in]: ids }, approved: true, isActive: true },
                attributes: [
                  'id', 'name', 'coverImage', 'displayPrice', 'discountPrice', 'basePrice', 'discountPercentage',
                  'marketingCommission', 'marketingEnabled', 'marketingCommissionType'
                ]
              });

              populatedItems = prods.map(product => {
                const plain = product.get({ plain: true });
                plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
                plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
                plain.coverImage = getListSafeImage(plain.coverImage);
                return plain;
              });
            }

            // In marketing mode, filter items to only include those with commission > 1
            if (isMarketing) {
              populatedItems = populatedItems.filter(item => {
                const commission = parseFloat(item.marketingCommission || 0);
                return item.marketingEnabled && commission > 1;
              });
            }

            // Keep the promotion if it has items OR if it's a priority system/default banner with custom image
            const isFallback = p.isSystem || p.isDefault || !!p.customImageUrl;
            
            if (populatedItems.length > 0 || isFallback) {
              result.push({
                ...promoData,
                products: populatedItems // maintaining key name 'products' for frontend compatibility
              });
            }
          }
          
          // Limit to final 5 after filtering
          return result.slice(0, 5);
        } catch (err) {
          console.error('[HomepageBatch] HeroPromotions query failed:', err.message);
          return [];
        }
      })()
    ]);

    // Process products with proper image handling
    const productsRes = productsResult || { results: [], totalCount: 0 };
    const products = productsRes.results.map(product => {
      try {
        const plain = product.get ? product.get({ plain: true }) : product;

        const firstImage = getListSafeImage(plain.coverImage);
        const images = firstImage ? [firstImage] : []; // Ensure images array has the cover image for frontend compatibility

        return {
          id: plain.id,
          name: plain.name,
          shortDescription: plain.shortDescription,
          basePrice: plain.basePrice,
          displayPrice: plain.displayPrice || plain.basePrice || 0,
          discountPrice: plain.discountPrice,
          price: plain.discountPrice || plain.displayPrice || plain.basePrice || 0,
          discountPercentage: plain.discountPercentage || 0,
          categoryId: plain.categoryId,
          subcategoryId: plain.subcategoryId,
          coverImage: firstImage,
          galleryImages: plain.galleryImages,
          images: plain.images || images,
          deliveryFee: plain.deliveryFee || 0,
          marketingCommission: plain.marketingCommission,
          marketingCommissionType: plain.marketingCommissionType,
          variants: plain.variants || [],
          approved: plain.approved,
          visibilityStatus: plain.visibilityStatus,
          suspended: plain.suspended,
          isActive: plain.isActive,
          status: plain.status,
          isSuperAdminProduct: !!(plain.seller && (String(plain.seller.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin' || String(plain.seller.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin'))
        };
      } catch (err) {
        console.error('[HomepageBatch] Process product error:', err.message);
        return null;
      }
    }).filter(Boolean);

    // Process services
    const servicesRes = servicesResult || { services: [], totalCount: 0 };
    const services = servicesRes.services.map(service => {
      try {
        const plain = service.get ? service.get({ plain: true }) : service;
        let images = [];
        if (plain.images) {
          if (typeof plain.images === 'string') {
            try {
              const parsed = JSON.parse(plain.images);
              images = Array.isArray(parsed) ? parsed.map(img => img.imageUrl || img) : [];
            } catch (e) { images = []; }
          } else if (Array.isArray(plain.images)) {
            images = plain.images.map(img => img.imageUrl || img);
          }
        }


        return {
          id: plain.id,
          title: plain.title,
          name: plain.title, // Alias for consistency
          basePrice: plain.basePrice,
          displayPrice: plain.displayPrice || plain.basePrice || 0,
          rating: plain.rating,
          userId: plain.userId,
          status: plain.status,
          isAvailable: plain.isAvailable,
          availabilityMode: plain.availabilityMode,
          availabilityDays: plain.availabilityDays,
          location: plain.location,
          vendorLocation: plain.vendorLocation,
          isFeatured: plain.isFeatured,
          discountPercentage: plain.discountPercentage || 0,
          discountPrice: plain.discountPrice,
          price: plain.discountPrice || plain.displayPrice || plain.basePrice || 0,
          deliveryFee: plain.deliveryFee || 0,
          marketingCommission: plain.marketingCommission,
          marketingCommissionType: plain.marketingCommissionType,
          categoryId: plain.categoryId,
          subcategoryId: plain.subcategoryId,
          images: images,
          coverImage: images.length > 0 ? images[0] : (plain.coverImage || null),
          description: plain.description
        };
      } catch (err) {
        console.error('[HomepageBatch] Process service error:', err.message);
        return null;
      }
    }).filter(Boolean);

    // Process fast food
    const fastFoodRes = fastFoodResult || { items: [], totalCount: 0 };
    const fastFood = fastFoodRes.items.map(item => {
      try {
        const plain = item.get ? item.get({ plain: true }) : item;
        // Map FastFood prices for consistency
        plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
        plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
        return plain;
      } catch (err) {
        return null;
      }
    }).filter(Boolean);

    // Process categories
    const categories = (categoriesResult || []).map(category => {
      const plain = category.get ? category.get({ plain: true }) : category;
      return {
        id: plain.id,
        name: plain.name,
        emoji: plain.emoji || '📦',
        slug: plain.slug,
        productCount: parseInt(plain.productCount) || 0,
        subcategoryCount: parseInt(plain.subcategoryCount) || 0,
        subcategories: plain.Subcategory || []
      };
    });

    const batchData = {
      products,
      categories,
      services: services,
      fastFood,
      heroPromotions: heroPromosResult,
      loadedAt: new Date().toISOString(),
      isBatchData: true,
      pagination: {
        totalProducts: productsRes.totalCount,
        totalServices: servicesRes.totalCount,
        totalFastFood: fastFoodRes.totalCount
      }
    };

    // Cache for 5 minutes (300 seconds)
    await cacheService.set(cacheKey, batchData, 300);

    const responseTime = Date.now() - startTime;

    res.set({
      'X-Cache': 'MISS',
      'X-Response-Time': `${responseTime}ms`,
      'X-Cache-Type': 'redis'
    });

    res.status(200).json(batchData);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('[HomepageBatch] Error:', error.message, `(${responseTime}ms)`);

    res.status(500).json({
      message: 'Server error while fetching batch homepage data.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      responseTime: `${responseTime}ms`
    });
  }
};

// Cache invalidation endpoint for admin use
const invalidateHomepageCache = async (req, res) => {
  try {
    console.log('[CacheInvalidation] Invalidating homepage and products cache');

    // Delete all homepage-related and product-related cache entries
    await Promise.all([
      cacheService.delPattern('homepage:*'),
      cacheService.delPattern('products:*')
    ]);

    res.status(200).json({
      message: 'Homepage and products cache invalidated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CacheInvalidation] Error:', error.message);
    res.status(500).json({
      message: 'Error invalidating cache',
      error: error.message
    });
  }
};

module.exports = {
  getUltraFastHomepageProducts,
  getHomepageBatchData,
  invalidateHomepageCache
};