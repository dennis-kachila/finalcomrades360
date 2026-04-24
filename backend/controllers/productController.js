const { Op } = require('sequelize');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Product, User, Category, Subcategory, ProductDeletionRequest, DeletedProduct, sequelize } = require('../models');
const relatedProductsModule = require('../modules/relatedProducts');
const { validateAndNormalizeImages, validateImageFile, generateUniqueFilename, cleanupOrphanedImages, ensureImagesExist, optimizeImage } = require('../utils/imageValidation');
const cacheService = require('../scripts/services/cacheService');
const { normalizeItemName } = require('../utils/itemNamePolicy');

const isInlineImageData = (value) => typeof value === 'string' && value.trim().toLowerCase().startsWith('data:image');

const removeInlineListImages = (item) => {
  const plain = { ...item };

  if (isInlineImageData(plain.coverImage)) {
    plain.coverImage = null;
  }

  if (Array.isArray(plain.galleryImages)) {
    plain.galleryImages = plain.galleryImages.filter((image) => !isInlineImageData(image));
  }

  if (Array.isArray(plain.images)) {
    plain.images = plain.images.filter((image) => !isInlineImageData(image));
  }

  return plain;
};

const createProduct = async (req, res, next) => {
  const sellerId = req.user.id;
  const {
    name,
    description,
    shortDescription,
    fullDescription,
    brand,
    model,
    unitOfMeasure,
    keywords,
    weight,
    length,
    width,
    height,
    warranty,
    returnPolicy,
    // Additional fields
    sku,
    barcode,
    lowStockThreshold,
    compareAtPrice,
    cost,
    metaKeywords,
    isDigital,
    downloadUrl,
    // Delivery fields
    deliveryFee,
    deliveryFeeType,
    deliveryCoverageZones,
    deliveryZones,
    // Marketing fields
    marketingEnabled,
    marketingCommission,
    marketingCommissionType,
    marketingCommissionPercentage,
    marketingStartDate,
    marketingEndDate,
    // Attributes
    condition,
    isBestSeller,
    shareableLink,
    basePrice,
    stock,
    categoryId,
    subcategoryId,
    discountPercentage,
    discountPrice
  } = req.body;
  const isDraft = ['1', 'true', true].includes((req.body.draft ?? '').toString().toLowerCase());
  
  // For drafts, allow a placeholder name if none provided
  if (isDraft && (!name || !String(name).trim())) {
    name = `Untitled Draft - ${new Date().toLocaleString()}`;
  }

  const normalizedName = normalizeItemName(name);
  // SEO fields
  const metaTitle = req.body.metaTitle;
  const metaDescription = req.body.metaDescription;
  // Parse existing tags JSON if provided; allow object or array
  let tags;
  try {
    if (typeof req.body.tags === 'string') tags = JSON.parse(req.body.tags);
    else if (req.body.tags && typeof req.body.tags === 'object') tags = req.body.tags;
  } catch { /* ignore parse error */ }
  if (tags === undefined) tags = [];
  // Accept extra JSON payloads and merge into tags for flexibility without schema migration
  // Expected optional body fields: attributes, variants, logistics (each JSON or JSON-string)
  const parseJson = (val) => {
    if (!val) return undefined;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return undefined; }
  };
  const extra = {
    attributes: parseJson(req.body.attributes),
    variants: parseJson(req.body.variants),
    logistics: parseJson(req.body.logistics),
    keyFeatures: parseJson(req.body.keyFeatures),
    specifications: parseJson(req.body.specifications),
    physicalFeatures: parseJson(req.body.physicalFeatures),
    deliveryCoverageZones: parseJson(req.body.deliveryCoverageZones),
  };
  // Merge extras into a tags object; if tags is an array, wrap into object under key 'tags'
  let mergedTags = {};
  if (Array.isArray(tags)) mergedTags.tags = tags; else if (typeof tags === 'object') mergedTags = { ...tags };
  Object.keys(extra).forEach(k => { if (extra[k] !== undefined) mergedTags[k] = extra[k]; });

  // DEBUG: log all required fields as received by the server
  console.log('🔍 [createProduct] Received fields:', {
    name: req.body.name || '(empty)',
    basePrice: req.body.basePrice || '(empty)',
    stock: req.body.stock || '(empty)',
    categoryId: req.body.categoryId || '(empty)',
    subcategoryId: req.body.subcategoryId || '(empty)',
    shortDescription: (req.body.shortDescription || req.body.description || '').substring(0, 50) || '(empty)',
    fullDescription: (req.body.fullDescription || '').substring(0, 50) || '(empty)',
    unitOfMeasure: req.body.unitOfMeasure || '(empty)',
    deliveryMethod: req.body.deliveryMethod || '(empty)',
    keywords: req.body.keywords || '(empty)',
    draft: req.body.draft || '(not set)',
    coverImageFiles: req.files?.coverImage?.length || 0,
    galleryImageFiles: req.files?.galleryImages?.length || 0,
  });

  // Perform validation ONLY if it is not a draft
  const missing = [];
  const effectiveShortDescription = (shortDescription || description || '').trim();

  // deliveryMethod can come from body or logistics in merged tags
  let deliveryMethod = '';
  if (req.body.deliveryMethod) {
    try {
      deliveryMethod = String(req.body.deliveryMethod).trim();
    } catch (e) {
      console.error('Error processing deliveryMethod:', e);
    }
  } else if (mergedTags?.logistics?.deliveryMethod) {
    try {
      deliveryMethod = String(mergedTags.logistics.deliveryMethod).trim();
    } catch (e) {
      console.error('Error processing deliveryMethod from logistics:', e);
    }
  }

  if (!isDraft) {
    if (!normalizedName || !normalizedName.trim()) missing.push('name');
    
    const parsedBasePrice = parseFloat(basePrice);
    if (!basePrice || isNaN(parsedBasePrice)) missing.push('basePrice');
    
    const parsedStock = parseInt(stock, 10);
    if (!stock || isNaN(parsedStock)) missing.push('stock');
    
    // Require at least one of categoryId or subcategoryId
    const categoryIdProvided = categoryId ? parseInt(categoryId, 10) : null;
    const subcategoryIdProvided = subcategoryId ? parseInt(subcategoryId, 10) : null;
    
    const hasCategoryContext = (
      (categoryIdProvided && !isNaN(categoryIdProvided)) ||
      (subcategoryIdProvided && !isNaN(subcategoryIdProvided))
    );
    if (!hasCategoryContext) missing.push('categoryId | subcategoryId');
    if (!effectiveShortDescription) missing.push('shortDescription');
    if (!unitOfMeasure || !unitOfMeasure.trim()) missing.push('unitOfMeasure');
    // Newly required fields
    if (!fullDescription || !fullDescription.trim()) missing.push('fullDescription');

    if (!deliveryMethod) {
      missing.push('deliveryMethod');
    }
    // keywords can come from body or merged tags
    if (!(req.body.keywords || mergedTags.keywords)) missing.push('keywords')

    if (missing.length) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Missing or invalid required fields',
        details: {
          fields: missing
        },
        missing: missing // Keep for backward compatibility
      });
    }
  }

  // Price Validation
  const displayPriceVal = (req.body.displayPrice && parseFloat(req.body.displayPrice) > 0) ? parseFloat(req.body.displayPrice) : basePrice;
  if (!isNaN(basePrice) && !isNaN(displayPriceVal) && displayPriceVal < basePrice) {
    return res.status(400).json({
      code: 'INVALID_PRICE',
      message: 'Display price cannot be less than base price.'
    });
  }

  // Media Upload: cover (1), gallery (2-5), video (1) optional
  const coverFiles = (req.files && req.files.coverImage) ? req.files.coverImage : [];
  const galleryFiles = (req.files && req.files.galleryImages) ? req.files.galleryImages : [];
  const videoFiles = (req.files && req.files.video) ? req.files.video : [];

  // Validate file requirements (only for non-draft products)
  if (!isDraft) {
    if (coverFiles.length < 1) {
      return res.status(400).json({
        code: 'COVER_REQUIRED',
        message: 'Cover image is required. Please upload at least one cover image.'
      });
    }
    if (galleryFiles.length < 2) {
      return res.status(400).json({
        code: 'GALLERY_REQUIRED',
        message: 'At least 2 gallery images are required. Please upload 2 or more gallery images.'
      });
    }
  }

  try {
    // Determine categoryId from either provided categoryId or subcategoryId
    let categoryId = null;
    let resolvedSubcategoryId = null;
    
    const categoryIdProvidedRaw = req.body.categoryId;
    const categoryIdProvided = categoryIdProvidedRaw ? parseInt(categoryIdProvidedRaw, 10) : null;

    if (categoryIdProvided && !Number.isNaN(categoryIdProvided)) {
      const catRow = await Category.findByPk(categoryIdProvided);
      if (catRow) {
        if (catRow.parentId) {
          categoryId = catRow.parentId;
          resolvedSubcategoryId = catRow.id;
        } else {
          categoryId = catRow.id;
          if (subcategoryId && !Number.isNaN(subcategoryId)) {
            resolvedSubcategoryId = subcategoryId;
          }
        }
      }
    } else if (req.body.subcategoryId && !Number.isNaN(subcategoryId)) {
      const subcat = await Category.findByPk(subcategoryId);
      if (subcat && subcat.parentId) {
        categoryId = subcat.parentId;
        resolvedSubcategoryId = subcat.id;
      }
    }

    // For drafts, we don't strictly reject missing category
    if (!isDraft && !categoryId) {
      return res.status(400).json({ code: 'CATEGORY_REQUIRED', message: 'Provide either categoryId or subcategoryId.' });
    }

    // Validate seller exists
    const seller = await User.findByPk(sellerId);
    if (!seller) {
      return res.status(400).json({ code: 'INVALID_SELLER', message: 'Authenticated seller does not exist.' });
    }

    // Validate category exists
    const parentCategory = await Category.findByPk(categoryId);
    if (!parentCategory || parentCategory.parentId !== null) {
      return res.status(400).json({ code: 'INVALID_CATEGORY', message: 'Resolved categoryId is not a valid top-level category.' });
    }

    // Log resolved IDs for debugging
    try { console.log('[createProduct] resolved IDs:', { sellerId, categoryId }); } catch (_) { }

    // Prevent duplicates per seller: exact same name (case-insensitive) within same category
    const existingProduct = await Product.findOne({
      where: {
        sellerId,
        categoryId,
        [Op.and]: [
          sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            '=',
            String(normalizedName).toLowerCase().trim()
          )
        ]
      }
    });

    if (existingProduct) {
      if (existingProduct.status === 'draft') {
        console.log(`[createProduct] Updating existing draft: ${existingProduct.id}`);
        // Reuse draft: Update fields and return the updated draft
        await existingProduct.update({
          description: description || existingProduct.description,
          shortDescription: effectiveShortDescription || existingProduct.shortDescription,
          fullDescription: fullDescription || existingProduct.fullDescription,
          brand: brand || existingProduct.brand,
          model: model || existingProduct.model,
          unitOfMeasure: unitOfMeasure || existingProduct.unitOfMeasure,
          keywords: keywords || existingProduct.keywords,
          weight: weight !== undefined ? weight : existingProduct.weight,
          length: length !== undefined ? length : existingProduct.length,
          width: width !== undefined ? width : existingProduct.width,
          height: height !== undefined ? height : existingProduct.height,
          warranty: warranty || existingProduct.warranty,
          returnPolicy: returnPolicy || existingProduct.returnPolicy,
          // categoryId: categoryId || existingProduct.categoryId, // Keep original category for consistency? Or update? Let's keep original if we found it IN that category.
          subcategoryId: subcategoryId || existingProduct.subcategoryId,
          basePrice: !isNaN(basePrice) ? basePrice : existingProduct.basePrice,
          displayPrice: (!isNaN(parseFloat(req.body.displayPrice)) && parseFloat(req.body.displayPrice) > 0) ? parseFloat(req.body.displayPrice) : (existingProduct.displayPrice || basePrice || existingProduct.basePrice),
          discountPercentage: !isNaN(discountPercentage) ? discountPercentage : existingProduct.discountPercentage,
          discountPrice: (!isNaN(discountPercentage) && discountPercentage > 0 && !isNaN(discountPrice))
            ? Math.round(discountPrice)
            : Math.round((!isNaN(parseFloat(req.body.displayPrice)) && parseFloat(req.body.displayPrice) > 0) ? parseFloat(req.body.displayPrice) : (existingProduct.displayPrice || basePrice || existingProduct.basePrice)),
          stock: !isNaN(stock) ? stock : existingProduct.stock,
          tags: mergedTags,
          deliveryMethod: deliveryMethod || existingProduct.deliveryMethod
        });

        // Return success as if created/updated
        return res.status(200).json({
          code: 'DRAFT_UPDATED',
          message: 'Draft updated successfully, picking up where you left off.',
          data: existingProduct
        });
      }

      return res.status(409).json({ code: 'DUPLICATE_PRODUCT', message: 'You already have a product with this name in the selected category.' });
    }

    const shareableLink = `product/${uuidv4()}`;

    // Handle images: use paths instead of Base64 to prevent DB bloat and crashes
    // Compression middleware has already optimized these to JPEG on disk
    const finalCoverImage = coverFiles.length > 0 ? `/uploads/products/${coverFiles[0].filename}` : null;
    const finalGalleryImages = galleryFiles.map(f => `/uploads/products/${f.filename}`);



    // Compose media tags (video file or link)
    const media = {};
    if (videoFiles.length > 0) media.videoPath = `/uploads/products/${videoFiles[0].filename}`;
    if (req.body.videoUrl) media.videoUrl = String(req.body.videoUrl);
    if (Object.keys(media).length > 0) mergedTags.media = { ...(mergedTags.media || {}), ...media };

    // Extract data from tags and store in direct fields
    const keyFeatures = mergedTags.keyFeatures || [];
    const specifications = mergedTags.specifications || {};
    const attributes = mergedTags.attributes || {};
    const variants = mergedTags.variants || [];
    const logistics = mergedTags.logistics || {};

    // Parse additional fields
    const marketingEnabled = req.body.marketingEnabled === 'true' || req.body.marketingEnabled === true;
    let marketingCommission = req.body.marketingCommission ? parseFloat(req.body.marketingCommission) : 0.00;
    const marketingCommissionType = req.body.marketingCommissionType || 'flat';

    // Calculate effective commission if percentage is provided
    let marketingCommissionPercentage = 0.00;
    if (marketingEnabled) {
      if (marketingCommissionType === 'percentage') {
        marketingCommissionPercentage = marketingCommission;
        const price = (discountPercentage > 0 && discountPrice) ? parseFloat(discountPrice) : (req.body.displayPrice ? parseFloat(req.body.displayPrice) : parseFloat(basePrice || 0));
        const markup = Math.max(0, price - parseFloat(basePrice || 0));
        marketingCommission = (markup * marketingCommissionPercentage) / 100;
      } else {
        marketingCommissionPercentage = 0.00;
      }
    }
    const featured = req.body.featured === 'true' || req.body.featured === true || req.body.isFeatured === 'true' || req.body.isFeatured === true;
    const isFlashSale = req.body.isFlashSale === 'true' || req.body.isFlashSale === true;
    const flashSalePrice = req.body.flashSalePrice ? parseFloat(req.body.flashSalePrice) : null;
    const flashSaleStart = req.body.flashSaleStart ? new Date(req.body.flashSaleStart) : null;
    const flashSaleEnd = req.body.flashSaleEnd ? new Date(req.body.flashSaleEnd) : null;

    // Pack dimensions
    const dimensions = {
      length: length ? length : (logistics.dimensions?.length ? logistics.dimensions.length : null),
      width: width ? width : (logistics.dimensions?.width ? logistics.dimensions.width : null),
      height: height ? height : (logistics.dimensions?.height ? logistics.dimensions.height : null)
    };

    // Pack extra logistics
    const updatedLogistics = {
      ...logistics,
      deliveryFeeType: deliveryFeeType || logistics.deliveryFeeType || 'flat',
      deliveryCoverageZones: deliveryCoverageZones || deliveryZones || logistics.deliveryCoverageZones || logistics.deliveryZones || [],
      marketingStartDate: marketingStartDate || logistics.marketingStartDate || null,
      marketingEndDate: marketingEndDate || logistics.marketingEndDate || null
    };

    // Pack extra attributes
    const updatedAttributes = {
      ...attributes,
      condition: condition || attributes.condition || 'Brand New',
      isBestSeller: [true, 'true', 1, '1'].includes(isBestSeller) || attributes.isBestSeller || false
    };

    const product = await Product.create({
      name: normalizedName,
      shortDescription: effectiveShortDescription,
      fullDescription,
      // Remove description field - not needed
      brand,
      unitOfMeasure,
      model,
      basePrice,
      displayPrice: (req.body.displayPrice && parseFloat(req.body.displayPrice) > 0) ? parseFloat(req.body.displayPrice) : null,
      stock,
      categoryId,
      subcategoryId: resolvedSubcategoryId,
      discountPercentage,
      discountPrice: (discountPercentage > 0 && discountPrice) ? Math.round(discountPrice) : Math.round((req.body.displayPrice && parseFloat(req.body.displayPrice) > 0) ? parseFloat(req.body.displayPrice) : (basePrice || 0)),

      coverImage: finalCoverImage,
      galleryImages: finalGalleryImages,
      // Store complex data in direct fields instead of tags
      keyFeatures: keyFeatures,
      specifications: specifications,
      attributes: updatedAttributes,
      variants: variants,
      logistics: updatedLogistics,
      dimensions: dimensions,
      // Store shipping/warranty in direct fields - ensure they are properly extracted
      deliveryMethod: deliveryMethod || 'Pickup',
      deliveryFee: deliveryFee ? parseFloat(deliveryFee) : 0.00,
      deliveryCoverageZones: extra.deliveryCoverageZones || deliveryZones || (updatedLogistics.deliveryCoverageZones ? updatedLogistics.deliveryCoverageZones : (updatedLogistics.deliveryZones ? updatedLogistics.deliveryZones : [])),
      warranty: warranty || (updatedLogistics.warranty ? String(updatedLogistics.warranty) : null),
      returnPolicy: returnPolicy || (updatedLogistics.returnPolicy ? String(updatedLogistics.returnPolicy) : null),
      weight: weight ? weight : (updatedLogistics.weight ? updatedLogistics.weight : null),
      keywords: mergedTags.keywords || keywords,
      sellerId,
      shareableLink,
      // Additional fields
      sku: sku || null,
      barcode: barcode || null,
      lowStockThreshold: lowStockThreshold ? parseInt(lowStockThreshold, 10) : 5,
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
      cost: cost ? parseFloat(cost) : null,
      // SEO fields
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      metaKeywords: metaKeywords || null,
      // Marketing fields
      marketingEnabled: marketingEnabled,
      marketingCommission: marketingCommission,
      marketingCommissionType: marketingCommissionType,
      marketingCommissionPercentage: marketingCommissionPercentage,
      marketingStartDate: req.body.marketingStartDate || logistics.marketingStartDate || null,
      marketingEndDate: req.body.marketingEndDate || logistics.marketingEndDate || null,
      marketingDuration: req.body.marketingDuration || logistics.marketingDuration || null,
      // Featured flag
      featured: featured,
      isFeatured: featured,
      // Flash sale fields
      isFlashSale: isFlashSale,
      flashSalePrice: flashSalePrice,
      flashSaleStart: flashSaleStart,
      flashSaleEnd: flashSaleEnd,
      // Digital product fields
      isDigital: isDigital === 'true' || isDigital === true || false,
      downloadUrl: downloadUrl || null,
      // Save tags field
      tags: mergedTags,
      // Status management: super_admin/admin products are active immediately (unless draft)
      status: (!isDraft && (String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin' || String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin')) ? 'active' : 'draft',
      approved: (!isDraft && (String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin' || String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin')),
      reviewStatus: isDraft ? 'draft' : ((String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin' || String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin') ? 'approved' : 'pending')
    });

    // Calculate related products for the new product asynchronously
    if (product.approved) {
      relatedProductsModule.triggerCalculation(product.id);
    }

    const isApproved = product.approved;
    const successMessage = isApproved
      ? 'Product created and approved successfully! It is now live on the platform.'
      : 'Product created successfully. It will be reviewed by an admin before going live.';

    // Invalidate product-related cache when new product is created
    try {
      await cacheService.delPattern('products:*');
      console.log('[createProduct] Invalidated product cache after creation');
    } catch (cacheError) {
      console.warn('[createProduct] Cache invalidation failed:', cacheError.message);
    }

    res.status(201).json({
      message: successMessage,
      product: {
        ...product.toJSON(),
        approved: isApproved
      }
    });
  } catch (error) {
    console.error('[createProduct] ERROR DETAILS:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code,
      originalError: error.original,
      errors: error.errors,
      body: req.body,
      files: req.files ? Object.keys(req.files) : 'No files'
    });

    if (error && (error.name === 'SequelizeForeignKeyConstraintError' || String(error.message || '').includes('FOREIGN KEY'))) {
      return res.status(400).json({
        success: false,
        code: 'FOREIGN_KEY_FAILED',
        message: 'Invalid foreign key value (sellerId or categoryId).',
        error: error.message
      });
    }

    // Pass all errors to the global error handler for consistent reporting
    next(error);
  }
};

const getHomepageProducts = async (req, res) => {
  try {
    console.log('[getHomepageProducts] Fast homepage products request');

    // Generate cache key based on parameters
    const cacheKey = `products:homepage:${req.query.limit || 8}:${req.query.page || 1}`;

    // Try to get from cache first
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      console.log('[getHomepageProducts] Cache hit for key:', cacheKey);
      res.set({
        'X-Cache': 'HIT',
        'X-Cache-Type': 'redis'
      });
      return res.status(200).json(cachedData);
    }

    console.log('[getHomepageProducts] Cache miss, fetching from database');

    // Only show approved, visible, non-suspended and active products for homepage
    const whereClause = {
      approved: true,
      visibilityStatus: 'visible',
      suspended: false,
      isActive: true,
      status: 'active',
      stock: { [Op.gt]: 0 } // Hide out of stock items
    };

    // Limit to 8 products for fast homepage loading
    const limit = parseInt(req.query.limit) || 8;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    // Get products with minimal data for fast loading
    const products = await Product.findAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'shortDescription', 'basePrice', 'displayPrice',
        'discountPrice', 'discountPercentage',
        'stock', 'categoryId', 'subcategoryId', 'createdAt',
        'coverImage', 'variants', 'tags'
      ],
      include: [
        {
          model: User,
          as: 'seller',
          attributes: ['id', 'name', 'role', 'businessName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Ultra-light processing - only essential data
    const sanitized = products.map(p => {
      const plain = removeInlineListImages(p.get({ plain: true }));

      // Only keep first image for homepage (fast loading)
      plain.coverImage = plain.coverImage || null;


      // Add price field mapping for frontend compatibility
      plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
      plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;

      // Add super admin flag
      if (plain.seller && ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase())) {
        plain.isSuperAdminProduct = true;
      } else {
        plain.isSuperAdminProduct = false;
      }

      return plain;
    });

    const result = {
      products: sanitized,
      isHomepageData: true,
      loadedAt: new Date().toISOString()
    };

    console.log('[getHomepageProducts] Returning', sanitized.length, 'fast homepage products');

    // Cache for 2 minutes (120 seconds) for homepage data
    await cacheService.set(cacheKey, result, 120);
    console.log('[getHomepageProducts] Cached result for key:', cacheKey);

    res.set({
      'X-Cache': 'MISS',
      'X-Cache-Type': 'redis'
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getHomepageProducts:', error);
    res.status(500).json({ message: 'Server error while fetching homepage products.', error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    // For superadmins/admins, show all products (approved and unapproved)
    // For regular users, only show approved and non-hidden products
    // For unauthenticated users, show only public approved products
    const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isSuperAdmin = userRole === 'superadmin' || userRole === 'admin';

    // Performance: Force lite mode for marketing queries to reduce payload size
    const isMarketingQuery = req.query.marketing === 'true' || req.query.marketing === true;
    const forceLite = isMarketingQuery || req.query.lite === 'true';

    // Generate cache key based on query parameters
    const cacheKey = `products:all:${req.query.page || 1}:${req.query.limit || (isMarketingQuery ? 20 : 8)}:${req.query.marketing || 'false'}:${req.query.categoryId || 'none'}:${req.query.subcategoryId || 'none'}:${isSuperAdmin ? 'admin' : 'public'}`;

    if (!isSuperAdmin) {
      const cachedData = await cacheService.get(cacheKey);
      if (cachedData) {
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Type': 'redis'
        });
        return res.status(200).json(cachedData);
      }
    }

    // For public listing, hide products marked as hidden, suspended, or inactive
    // Super admin created products are automatically included and visible
    const whereClause = isSuperAdmin
      ? {}
      : {
        approved: { [Op.or]: [true, 1] },
        visibilityStatus: 'visible',
        suspended: { [Op.or]: [false, 0] },
        isActive: { [Op.or]: [true, 1] },
        status: 'active',
        stock: { [Op.gt]: 0 } // Hide out of stock items
      };

    if (isMarketingQuery) {
      whereClause.marketingEnabled = { [Op.or]: [true, 1] };
      // Marketing queries also need commission > 1
      whereClause.marketingCommission = { [Op.gt]: 1 };
    }

    // Parse pagination parameters - optimize for marketing queries
    const page = parseInt(req.query.page) || 1;
    const defaultLimit = isMarketingQuery ? 20 : 8; // Marketing gets 20, others get 8
    const limit = parseInt(req.query.limit) || defaultLimit;
    const offset = (page - 1) * limit;

    // Add category and subcategory filters if provided
    if (req.query.categoryId) {
      whereClause.categoryId = parseInt(req.query.categoryId);
    }
    if (req.query.subcategoryId) {
      whereClause.subcategoryId = parseInt(req.query.subcategoryId);
    }

    // Add approved filter if provided
    if (req.query.approved === 'true') {
      whereClause.approved = true;
    } else if (req.query.approved === 'false') {
      whereClause.approved = false;
    }

    // Stock Status Filter
    if (req.query.stockStatus) {
      const lowStockCol = sequelize.fn('COALESCE', sequelize.col('lowStockThreshold'), 5);

      if (req.query.stockStatus === 'inStock') {
        whereClause.stock = { [Op.gt]: lowStockCol };
      } else if (req.query.stockStatus === 'lowStock') {
        whereClause.stock = {
          [Op.lte]: lowStockCol,
          [Op.gt]: 0
        };
      } else if (req.query.stockStatus === 'outOfStock') {
        whereClause.stock = 0;
      }
    }

    // Search Filter
    if (req.query.search || req.query.q) {
      const searchTerm = (req.query.search || req.query.q).trim();
      if (searchTerm) {
        const searchCondition = { [Op.like]: `%${searchTerm}%` };

        whereClause[Op.and] = [
          ...(whereClause[Op.and] || []),
          {
            [Op.or]: [
              { name: searchCondition },
              { shortDescription: searchCondition },
              { fullDescription: searchCondition },
              { brand: searchCondition },
              // Search in keywords (which is JSON/Array so we might need special handling depending on DB, 
              // but textual search on JSON string representation often works for simple cases in like)
              // or rely on name/desc primarily.
            ]
          }
        ];
      }
    }

    // Performance: Simplify ordering for marketing queries
    const orderBy = [['createdAt', 'DESC']];

    // Optimized query with reduced includes and better performance
    const findOptions = {
      where: whereClause,
      include: [
        {
          model: User,
          as: 'seller',
          attributes: forceLite ? ['id', 'name', 'role'] : ['id', 'name', 'email', 'role'],
          required: false
        },
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name'],
          required: false
        },
        {
          model: Subcategory,
          as: 'subcategory',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: orderBy,
      limit: limit,
      offset: offset
    };

    // Performance: Force minimal fields for lite mode and marketing queries
    if (forceLite) {
      findOptions.attributes = [
        'id', 'name', 'shortDescription', 'basePrice', 'displayPrice', 'discountPrice',
        'discountPercentage',
        'stock', 'status', 'approved', 'reviewStatus', 'categoryId',
        'subcategoryId', 'sellerId', 'createdAt', 'isActive', 'visibilityStatus',
        'marketingEnabled', 'marketingCommission', 'marketingCommissionType',
        'coverImage', 'galleryImages', 'isFlashSale', 'variants', 'tags'
      ];
    }

    const [count, products] = await Promise.all([
      Product.count({ where: whereClause }),
      Product.findAll(findOptions)
    ]);

    // Lightweight image processing - only process first image for list view
    const sanitized = products.map(p => {
      const plain = p.get({ plain: true });

      // Performance: For lite/marketing mode, use lightweight image processing
      if (forceLite) {
        // Keep coverImage as-is (including base64 data URIs) — product cards need ONE cover image.
        // Strip base64 from galleryImages to keep the list payload manageable.
        const isInlineData = (v) => typeof v === 'string' && v.trim().toLowerCase().startsWith('data:image');

        // Normalize coverImage path if it's a relative file path
        if (plain.coverImage && !isInlineData(plain.coverImage) && !/^https?:\/\//i.test(plain.coverImage)) {
          let p = plain.coverImage.replace(/^\/+/, '');
          if (!p.startsWith('uploads/')) p = `uploads/products/${p}`;
          plain.coverImage = `/${p}`;
        }

        // Strip base64 from galleryImages to save bandwidth on list endpoints
        let rawGallery = plain.galleryImages || [];
        if (typeof rawGallery === 'string') { try { rawGallery = JSON.parse(rawGallery); } catch (_) { rawGallery = []; } }
        plain.galleryImages = Array.isArray(rawGallery) ? rawGallery.filter(g => !isInlineData(g)) : [];

        // Ensure images[] is populated for frontend fallback chain
        plain.images = plain.coverImage ? [plain.coverImage, ...plain.galleryImages] : plain.galleryImages;
      } else {
        // Full mode: process all images
        // Use new columns if available, otherwise fallback to images
        if (plain.coverImage || plain.galleryImages) {
          plain.images = [plain.coverImage, ...(plain.galleryImages || [])].filter(Boolean);
        } else {
          plain.images = [];
          plain.coverImage = null;
        }
      }

      // Add price field mapping for frontend compatibility
      plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;

      // Ensure critical status fields are present and correctly typed for frontend filters
      // This helps if they are missing from certain database rows or cache objects
      plain.status = plain.status || 'active';
      plain.approved = plain.approved === 1 || plain.approved === true || plain.approved === '1' || plain.status === 'active';
      plain.visibilityStatus = plain.visibilityStatus || 'visible';
      plain.isActive = plain.isActive !== false && plain.isActive !== 0 && plain.isActive !== '0';

      // Add a flag to identify super admin created products for frontend
      if (plain.seller && ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase())) {
        plain.isSuperAdminProduct = true;
      } else {
        plain.isSuperAdminProduct = false;
      }

      return plain;
    });

    const result = {
      products: sanitized,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalProducts: count,
        productsPerPage: limit
      }
    };

    // Cache the result for 2 minutes (120 seconds) for public users
    if (!isSuperAdmin) {
      await cacheService.set(cacheKey, result, 120);
    }

    res.set({
      'X-Cache': 'MISS',
      'X-Cache-Type': 'redis'
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.status(500).json({ message: 'Server error while fetching products.', error: error.message });
  }
};

const getRecentlyApprovedProducts = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const cacheKey = `products:recently-approved:${page}:${limit}`;

    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    const products = await Product.findAll({
      where: {
        approved: true,
        reviewStatus: 'approved',
        visibilityStatus: 'visible',
        suspended: false,
        isActive: true,
        status: 'active',
        updatedAt: { [Op.gte]: thirtyDaysAgo }
      },
      include: [
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'role', 'businessName'], required: false },
        { model: Category, as: 'category', attributes: ['id', 'name'], required: false },
        { model: Subcategory, as: 'subcategory', attributes: ['id', 'name'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    // Fast image normalizer — no disk I/O
    const sanitized = products.map(p => {
      const plain = removeInlineListImages(p.get({ plain: true }));
      plain.images = [plain.coverImage, ...(plain.galleryImages || [])].filter(Boolean);
      plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
      plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
      plain.isSuperAdminProduct = plain.seller && ['superadmin', 'super_admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase());
      return plain;
    });

    await cacheService.set(cacheKey, sanitized, 120);

    res.status(200).json(sanitized);
  } catch (error) {
    console.error('Error in getRecentlyApprovedProducts:', error);
    res.status(500).json({ message: 'Server error while fetching recently approved products', error: error.message });
  }
};

const getSuperAdminProducts = async (req, res) => {
  try {
    const { showRecentlyApproved = 'false' } = req.query;

    if (showRecentlyApproved === 'true') {
      // Get recently approved products created by super admins and admins
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const products = await Product.findAll({
        where: {
          approved: true,
          reviewStatus: 'approved',
          visibilityStatus: 'visible',
          suspended: false,
          isActive: true,
          status: 'active',
          createdAt: {
            [Op.gte]: thirtyDaysAgo
          }
        },
        include: [
          {
            model: User,
            as: 'seller',
            attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'],
            where: {
              role: { [Op.in]: ['superadmin', 'super_admin', 'super-admin', 'admin'] }
            },
            required: true
          },
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name'],
            required: false
          },
          {
            model: Subcategory,
            as: 'subcategory',
            attributes: ['id', 'name'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const sanitized = await Promise.all(products.map(async (p) => {
        const plain = p.get({ plain: true });
        plain.images = await ensureImagesExist((plain.galleryImages ? [plain.coverImage, ...plain.galleryImages] : [plain.coverImage]));
        plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
        plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
        return plain;
      }));

      res.status(200).json(sanitized);
    } else {
      // Get all approved products created by super admins and admins for homepage display
      const products = await Product.findAll({
        where: {
          approved: true,
          reviewStatus: 'approved',
          visibilityStatus: 'visible',
          suspended: false,
          isActive: true,
          status: 'active'
        },
        include: [
          {
            model: User,
            as: 'seller',
            attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'],
            where: {
              role: { [Op.in]: ['superadmin', 'super_admin', 'super-admin', 'admin'] }
            },
            required: true
          },
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name'],
            required: false
          },
          {
            model: Subcategory,
            as: 'subcategory',
            attributes: ['id', 'name'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      const sanitized = await Promise.all(products.map(async (p) => {
        const plain = p.get({ plain: true });
        plain.images = await ensureImagesExist((plain.galleryImages ? [plain.coverImage, ...plain.galleryImages] : [plain.coverImage]));
        plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
        plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
        return plain;
      }));

      res.status(200).json(sanitized);
    }
  } catch (error) {
    console.error('Error in getSuperAdminProducts:', error);
    res.status(500).json({ message: 'Server error while fetching super admin products', error: error.message });
  }
};

const getPendingProducts = async (req, res) => {
  try {
    const isLite = req.query.lite === 'true';
    const limit = Math.min(200, parseInt(req.query.limit || '100', 10));
    const page = Math.max(1, parseInt(req.query.page || '1', 10));

    const findOptions = {
      where: {
        approved: false,
        reviewStatus: 'pending'
      },
      include: [
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'role', 'businessName'], required: true },
        { model: Category, as: 'category', attributes: ['id', 'name'], required: false },
        { model: Subcategory, as: 'subcategory', attributes: ['id', 'name'], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    };

    if (isLite) {
      findOptions.attributes = [
        'id', 'name', 'shortDescription', 'basePrice', 'displayPrice',
        'stock', 'status', 'approved', 'reviewStatus', 'categoryId',
        'subcategoryId', 'sellerId', 'createdAt', 'isActive', 'visibilityStatus',
        'coverImage'
      ];
    }

    const products = await Product.findAll(findOptions);

    // Fast image normalizer — no disk I/O
    const sanitized = products.map(p => {
      const plain = p.get({ plain: true });
      plain.images = [plain.coverImage, ...(plain.galleryImages || [])].filter(Boolean);
      plain.displayPrice = plain.displayPrice || plain.basePrice || 0;
      plain.price = plain.discountPrice || plain.displayPrice || plain.basePrice || 0;
      return plain;
    });

    res.status(200).json(sanitized);
  } catch (error) {
    console.error('Error in getPendingProducts:', error);
    res.status(500).json({ message: 'Server error while fetching pending products', error: error.message });
  }
};

const approveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { displayPrice } = req.body; // Require displayPrice during approval
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate displayPrice is provided and valid
    if (!displayPrice || isNaN(parseFloat(displayPrice)) || parseFloat(displayPrice) <= 0) {
      return res.status(400).json({
        message: 'Display price is required and must be a valid positive number',
        code: 'DISPLAY_PRICE_REQUIRED'
      });
    }

    const parsedDisplayPrice = parseFloat(displayPrice);

    // Update product status with displayPrice
    await product.update({
      approved: true,
      reviewStatus: 'approved',
      displayPrice: parsedDisplayPrice
    });

    res.status(200).json({
      message: 'Product approved successfully with display price set',
      product: product
    });
  } catch (error) {
    console.error('Error approving product:', error);
    res.status(500).json({ message: 'Server error while approving product', error: error.message });
  }
};

const rejectProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update product status
    await product.update({
      approved: false,
      reviewStatus: 'rejected',
      reviewNotes: reason || 'Product rejected by admin'
    });

    res.status(200).json({
      message: 'Product rejected successfully',
      product: product
    });
  } catch (error) {
    console.error('Error rejecting product:', error);
    res.status(500).json({ message: 'Server error while rejecting product', error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    console.log('[getProductById] Request received for product ID:', req.params.id);

    const { id } = req.params;
    const pid = parseInt(id, 10);
    console.log('[getProductById] Parsed product ID:', pid);

    if (isNaN(pid)) {
      console.log('[getProductById] Invalid product ID:', id);
      return res.status(400).json({ message: 'Invalid product id', error: 'INVALID_PRODUCT_ID', receivedValue: id });
    }

    // Get product with seller and category information using eager loading
    console.log('[getProductById] Querying database for product:', pid);

    let product;
    try {
      product = await Product.findOne({
        where: { id: pid },
        include: [
          {
            model: User,
            as: 'seller',
            attributes: ['id', 'name', 'email', 'phone', 'businessName'],
            required: false
          },
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name', 'parentId'],
            include: [
              {
                model: Category,
                as: 'parent',
                attributes: ['id', 'name']
              }
            ],
            required: false
          },
          {
            model: Subcategory,
            as: 'subcategory',
            attributes: ['id', 'name', 'categoryId'],
            required: false
          }
        ]
      });
    } catch (dbError) {
      console.error('[getProductById] Database query error:', dbError);
      return res.status(500).json({
        message: 'Database error while fetching product',
        error: 'DATABASE_ERROR',
        details: dbError.message
      });
    }

    console.log('[getProductById] Database query result:', product ? `Found: ${product.name}` : 'Not found');

    if (!product) {
      console.log('[getProductById] Product not found in database');
      return res.status(404).json({ message: 'Product not found', error: 'PRODUCT_NOT_FOUND', productId: pid });
    }

    // If product is not live, block for public users but allow owners, admins, and superadmins
    const role = req.user?.role;
    const userRoleStr = String(role || '').toLowerCase();
    const isAdminViewer = ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(userRoleStr);
    const isOwner = req.user && req.user.id === product.sellerId;
    const isLive = product.approved && product.visibilityStatus === 'visible' && !product.suspended && product.isActive && product.status === 'active';

    if (!isLive && !isAdminViewer && !isOwner) {
      console.log('[getProductById] Visibility check failed. Product not live and user is not owner/admin.');
      return res.status(404).json({ message: 'Product not found' });
    }

    // Parse JSON fields if they're strings
    const parseJsonField = (field) => {
      if (!field) return {};
      if (typeof field === 'object') return field;
      try {
        return JSON.parse(field);
      } catch (e) {
        console.error('Error parsing JSON field:', e);
        return {};
      }
    };

    // Format the response to include all necessary fields
    console.log('[getProductById] Formatting product data...');

    let plain;
    try {
      plain = product.get({ plain: true });
      console.log('[getProductById] Product data extracted successfully');
    } catch (extractError) {
      console.error('[getProductById] Error extracting product data:', extractError);
      return res.status(500).json({
        message: 'Error processing product data',
        error: 'DATA_EXTRACTION_ERROR',
        details: extractError.message
      });
    }

    // Normalize image fields - pass them through as-is so the frontend can handle
    // missing files via its own resolveImageUrl + onError fallback.
    // We do NOT replace missing file-path images with a placeholder SVG here because
    // that fallback gets cached permanently in usePersistentFetch and hides the real image.
    console.log('[getProductById] Processing images...');
    try {
      const normalizeImg = (img) => {
        if (!img) return null;
        const s = typeof img === 'string' ? img.trim() : null;
        if (!s) return null;
        // Data URIs and absolute URLs pass through unchanged
        if (/^(data:|https?:\/\/)/i.test(s)) return s;
        // Normalize relative paths: strip leading slash, add /uploads prefix if missing
        let p = s.replace(/^\/+/, '');
        if (!p.startsWith('uploads/')) p = `uploads/products/${p}`;
        return `/${p}`;
      };

      plain.coverImage = normalizeImg(plain.coverImage);

      let gallery = plain.galleryImages || [];
      if (typeof gallery === 'string') {
        try { gallery = JSON.parse(gallery); } catch (_) { gallery = []; }
      }
      plain.galleryImages = Array.isArray(gallery)
        ? gallery.map(normalizeImg).filter(Boolean)
        : [];

      console.log('[getProductById] Images normalized, coverImage present:', !!plain.coverImage, ', gallery count:', plain.galleryImages.length);
    } catch (imageError) {
      console.error('[getProductById] Error normalizing images:', imageError);
      // Continue without images rather than failing completely
      plain.galleryImages = [];
    }
    const specifications = parseJsonField(plain.specifications);
    const physicalFeatures = parseJsonField(plain.physicalFeatures || plain.attributes);
    const tags = parseJsonField(plain.tags);

    // Determine category/subcategory consistently
    console.log('[getProductById] Plain object keys:', Object.keys(plain));
    console.log('[getProductById] Associations in plain object:', {
      hasCategory: !!plain.category,
      hasCategoryCap: !!plain.Category,
      hasSubcategory: !!plain.subcategory,
      hasSubcategoryCap: !!plain.Subcategory,
      categoryName: plain.category?.name || plain.Category?.name,
      subcategoryName: plain.subcategory?.name || plain.Subcategory?.name
    });

    let category = plain.category || plain.Category || null;
    let subcategory = plain.subcategory || plain.Subcategory || null;
    let categoryId = plain.categoryId || null;
    let subcategoryId = plain.subcategoryId || null;

    // If no subcategoryId stored but Category has parentId, treat Category as subcategory
    if (!subcategoryId && category && category.parentId) {
      subcategoryId = category.id;
      subcategory = { id: category.id, name: category.name, categoryId: category.parentId };
      categoryId = category.parentId;
      // We do not have the full parent category object here; keep category as-is or null it if needed
    }

    const response = {
      ...plain,
      keyFeatures: tags?.keyFeatures || (Array.isArray(plain.keyFeatures) ? plain.keyFeatures : (plain.keyFeatures ? [plain.keyFeatures] : [])),
      specifications: tags?.specifications || specifications || {},
      physicalFeatures: tags?.physicalFeatures || tags?.attributes || physicalFeatures || {},
      attributes: tags?.attributes || physicalFeatures || {},
      variants: tags?.variants || (Array.isArray(plain.variants) ? plain.variants : []),
      tags: tags || {},
      category,
      subcategory,
      categoryId,
      subcategoryId,
      media: Array.isArray(plain.media) ? plain.media : [],
      displayPrice: plain.displayPrice || plain.basePrice || 0,
      discountPrice: plain.discountPrice || 0,
      unitOfMeasure: plain.unitOfMeasure || '',
      isActive: plain.isActive !== undefined ? plain.isActive : true,
      isFeatured: plain.isFeatured || false,
      metaTitle: plain.metaTitle || '',
      metaDescription: plain.metaDescription || '',
      metaKeywords: plain.metaKeywords || '',
      brand: plain.brand || '',
      shortDescription: plain.shortDescription || plain.description || '',
      fullDescription: plain.fullDescription || '',
      basePrice: plain.basePrice || 0,
      stock: plain.stock || 0,
      sku: plain.sku || '',
      weight: plain.weight || '',
      length: plain.dimensions?.length || plain.length || '',
      width: plain.dimensions?.width || plain.width || '',
      height: plain.dimensions?.height || plain.height || '',
      deliveryMethod: plain.deliveryMethod || 'Pickup',
      warranty: plain.warranty || '',
      returnPolicy: plain.returnPolicy || '',
      // Unpack logistics
      deliveryFeeType: tags?.logistics?.deliveryFeeType || plain.logistics?.deliveryFeeType || 'flat',
      deliveryCoverageZones: tags?.deliveryCoverageZones || plain.deliveryCoverageZones || tags?.logistics?.deliveryCoverageZones || plain.logistics?.deliveryCoverageZones || tags?.logistics?.deliveryZones || plain.logistics?.deliveryZones || [],
      marketingStartDate: plain.logistics?.marketingStartDate || null,
      marketingEndDate: plain.logistics?.marketingEndDate || null,
      // Unpack attributes
      condition: plain.attributes?.condition || 'Brand New',
      isBestSeller: plain.attributes?.isBestSeller || false,
      hasPhysicalFeatures: true,
      hasSpecifications: true
    };

    // Get related products data
    console.log('[getProductById] Processing related products...');
    try {
      let relatedProductIds = plain.relatedProducts || [];
      if (typeof relatedProductIds === 'string') {
        try {
          relatedProductIds = JSON.parse(relatedProductIds || '[]');
        } catch (parseError) {
          relatedProductIds = [];
        }
      }
      if (!Array.isArray(relatedProductIds)) {
        relatedProductIds = [];
      }

      const relatedProductsData = await relatedProductsModule.getRelatedProductsData(relatedProductIds);
      console.log('[getProductById] Related products processed, count:', relatedProductsData.length);
      response.relatedProducts = relatedProductsData;
    } catch (relatedError) {
      console.error('[getProductById] Error processing related products:', relatedError);
      // Continue without related products rather than failing
      response.relatedProducts = [];
    }

    // Keep both uppercase and lowercase for maximum frontend compatibility
    // but log what we found
    console.log('[getProductById] Response object associations:', {
      has_category: !!response.category,
      has_subcategory: !!response.subcategory,
      has_Category: !!response.Category,
      has_Subcategory: !!response.Subcategory,
      has_Seller: !!response.Seller,
      has_seller: !!response.seller
    });

    console.log('Product data being sent to frontend:', JSON.stringify({
      id: response.id,
      name: response.name,
      categoryId: response.categoryId,
      subcategoryId: response.subcategoryId,
      category: response.category,
      subcategory: response.subcategory,
      hasPhysicalFeatures: !!response.physicalFeatures && Object.keys(response.physicalFeatures).length > 0,
      hasKeyFeatures: response.keyFeatures && response.keyFeatures.length > 0,
      hasSpecifications: response.specifications && Object.keys(response.specifications).length > 0,
      relatedProductsCount: response.relatedProducts.length
    }, null, 2));

    res.status(200).json(response);
  } catch (error) {
    console.error('[getProductById] UNHANDLED ERROR:', {
      message: error.message,
      stack: error.stack,
      productId: req.params.id,
      userId: req.user?.id
    });

    res.status(500).json({
      message: 'Server error while fetching product.',
      error: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
      productId: req.params.id
    });
  }
};

const updateProduct = async (req, res, next) => {
  const productId = parseInt(req.params.id, 10);
  const sellerId = req.user.id;

  if (isNaN(productId)) {
    return res.status(400).json({ message: 'Invalid product ID' });
  }

  try {
    // Find the product
    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user owns this product or is admin/super_admin
    const isOwner = product.sellerId === sellerId;
    const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to edit this product' });
    }

    // CRITICAL: Protect ownership fields
    if (req.body.sellerId || req.body.addedBy) {
      console.warn(`⚠️ [updateProduct] Attempt to modify ownership fields (sellerId/addedBy) detected! Ignoring.`);
      delete req.body.sellerId;
      delete req.body.addedBy;
    }

    // Parse form data - now includes new fields
    const {
      name,
      shortDescription,
      fullDescription,
      brand,
      unitOfMeasure,
      categoryId,
      subcategoryId,
      basePrice,
      displayPrice,
      discountPrice,
      stock,
      keywords,
      shareableLink,
      weight,
      length,
      width,
      height,
      deliveryMethod,
      warranty,
      returnPolicy,
      // Additional fields
      model,
      sku,
      barcode,
      lowStockThreshold,
      compareAtPrice,
      cost,
      metaTitle,
      metaDescription,
      metaKeywords,
      isDigital,
      downloadUrl,
      // Flash sale fields
      isFlashSale,
      flashSalePrice,
      flashSaleStart,
      flashSaleEnd,
      // Marketing fields
      marketingEnabled,
      marketingCommission,
      marketingCommissionType,
      marketingCommissionPercentage,
      marketingStartDate,
      marketingEndDate,
      // Featured
      featured,
      isFeatured,
      // Delivery fields
      deliveryFee,
      deliveryFeeType,
      deliveryCoverageZones,
      deliveryZones,
      // Media handling fields
      existingCoverImage,
      existingVideo,
      condition,
      isBestSeller
    } = req.body;

    // Parse JSON fields
    let tags = {};
    try {
      if (req.body.tags) {
        tags = typeof req.body.tags === 'string' ? JSON.parse(req.body.tags) : req.body.tags;
      }
    } catch (e) {
      console.warn('Error parsing tags:', e);
    }

    // Parse additional JSON fields
    const parseJson = (val) => {
      if (!val) return undefined;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return undefined; }
    };

    const keyFeatures = parseJson(req.body.keyFeatures);
    const physicalFeatures = parseJson(req.body.physicalFeatures);
    const specifications = parseJson(req.body.specifications);
    const variants = parseJson(req.body.variants);

    // DEBUG: Log received JSON fields
    console.log('[updateProduct] JSON fields received:', {
      rawKeyFeatures: req.body.keyFeatures,
      parsedKeyFeatures: keyFeatures,
      rawSpecs: req.body.specifications,
      parsedSpecs: specifications,
      rawPhysical: req.body.physicalFeatures,
      parsedPhysical: physicalFeatures
    });
    const existingGalleryImages = parseJson(req.body.existingGalleryImages);

    // Merge extras into tags
    let mergedTags = { ...tags };
    if (keyFeatures) mergedTags.keyFeatures = keyFeatures;
    if (physicalFeatures) mergedTags.attributes = physicalFeatures;
    if (specifications) mergedTags.specifications = specifications;
    if (variants) mergedTags.variants = variants;

    // Handle media uploads
    const coverFiles = (req.files && req.files.coverImage) ? req.files.coverImage : [];
    const galleryFiles = (req.files && req.files.galleryImages) ? req.files.galleryImages : [];
    const videoFiles = (req.files && req.files.video) ? req.files.video : [];

    console.log('[updateProduct] Files received:', {
      cover: coverFiles.length,
      gallery: galleryFiles.length,
      video: videoFiles.length
    });
    console.log('[updateProduct] Existing images from body:', {
      existingCoverImage: req.body.existingCoverImage,
      existingGalleryImages: req.body.existingGalleryImages,
      removeCoverImage: req.body.removeCoverImage,
      removedGalleryIndices: req.body.removedGalleryIndices,
      removeVideo: req.body.removeVideo
    });
    console.log('[updateProduct] Current product images:', (product.galleryImages ? [product.coverImage, ...product.galleryImages] : [product.coverImage]));

    // Build image URLs array
    let imageUrls = [];

    // Handle cover image
    if (req.body.removeCoverImage === 'true') {
      console.log('[updateProduct] Removing cover image');
    } else if (coverFiles.length > 0) {
      // New cover image optimized to JPEG by middleware
      imageUrls.push(`/uploads/products/${coverFiles[0].filename}`);
    } else if (req.body.existingCoverImage) {
      imageUrls.push(req.body.existingCoverImage);
    } else if (product.coverImage) {
      imageUrls.push(product.coverImage);
    }

    // Handle gallery images
    let existingGalleryUrls = [];
    if (existingGalleryImages) {
      existingGalleryUrls = Array.isArray(existingGalleryImages) ? existingGalleryImages : [existingGalleryImages];
    } else if (product.galleryImages) {
      existingGalleryUrls = product.galleryImages;
    }

    // Filter out removed gallery images if indices provided
    if (req.body.removedGalleryIndices) {
      let removedIndices = [];
      try {
        removedIndices = typeof req.body.removedGalleryIndices === 'string' 
          ? JSON.parse(req.body.removedGalleryIndices) 
          : req.body.removedGalleryIndices;
      } catch (e) { console.warn('Error parsing removedGalleryIndices:', e); }
      
      existingGalleryUrls = existingGalleryUrls.filter((_, idx) => !removedIndices.includes(idx));
    }

    imageUrls = [...imageUrls, ...existingGalleryUrls];

    // Add new gallery images from disk (optimized by middleware)
    if (galleryFiles.length > 0) {
      galleryFiles.forEach(f => {
        imageUrls.push(`/uploads/products/${f.filename}`);
      });
    }

    console.log('[updateProduct] Final imageUrls before validation:', imageUrls);

    // Validate and normalize all image URLs
    imageUrls = validateAndNormalizeImages(imageUrls);

    console.log('[updateProduct] Final imageUrls after validation:', imageUrls);

    // Handle video
    const media = mergedTags.media || {};

    if (req.body.removeVideo === 'true') {
      // User wants to remove video
      console.log('[updateProduct] Removing existing video');
      // Don't set any video path or URL
    } else if (videoFiles.length > 0) {
      // New video uploaded
      console.log('[updateProduct] Using new video');
      media.videoPath = `/uploads/products/${videoFiles[0].filename}`;
    } else if (req.body.existingVideo) {
      // Keep existing video
      console.log('[updateProduct] Keeping existing video:', req.body.existingVideo);
      media.videoPath = req.body.existingVideo;
    } else if (product.media && product.media.videoPath) {
      // Keep current product video
      console.log('[updateProduct] Keeping current product video:', product.media.videoPath);
      media.videoPath = product.media.videoPath;
    }

    if (req.body.videoUrl) {
      media.videoUrl = String(req.body.videoUrl);
    }

    if (Object.keys(media).length > 0) {
      mergedTags.media = media;
    } else {
      // If video was removed, ensure media is cleared
      delete mergedTags.media;
    }

    // Prepare update data - store in direct fields like createProduct does
    const updateData = {};
    if (name) updateData.name = name;
    if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
    if (fullDescription !== undefined) updateData.fullDescription = fullDescription;
    if (brand !== undefined) updateData.brand = brand;
    if (unitOfMeasure !== undefined) updateData.unitOfMeasure = unitOfMeasure;

    // Price Standardization Logic
    if (basePrice !== undefined) updateData.basePrice = parseFloat(basePrice);
    if (displayPrice !== undefined) updateData.displayPrice = parseFloat(displayPrice);
    if (req.body.discountPercentage !== undefined) updateData.discountPercentage = parseFloat(req.body.discountPercentage);
    if (discountPrice !== undefined) updateData.discountPrice = Math.round(parseFloat(discountPrice));

    // Enforce consistency: if no discount, discountPrice must equal displayPrice
    const finalDisplayPrice = (updateData.displayPrice !== undefined && updateData.displayPrice > 0) ? updateData.displayPrice : (product.displayPrice || null);
    const finalBasePrice = updateData.basePrice !== undefined ? updateData.basePrice : product.basePrice;

    if (finalDisplayPrice && finalDisplayPrice < finalBasePrice) {
      return res.status(400).json({
        code: 'INVALID_PRICE',
        message: 'Display price cannot be less than base price.'
      });
    }

    const finalDiscountPct = updateData.discountPercentage !== undefined ? updateData.discountPercentage : (product.discountPercentage || 0);

    if (finalDiscountPct === 0) {
      updateData.discountPrice = Math.round(finalDisplayPrice || finalBasePrice);
    } else if (finalDisplayPrice && !updateData.discountPrice && finalDiscountPct > 0) {
      // Calculate discount price if percentage provided but price isn't
      updateData.discountPrice = Math.round(finalDisplayPrice * (1 - finalDiscountPct / 100));
    }

    if (stock !== undefined) updateData.stock = parseInt(stock, 10);

    if (categoryId !== undefined) {
      const catId = parseInt(categoryId, 10);
      if (!isNaN(catId)) updateData.categoryId = catId;
    }

    if (subcategoryId !== undefined) {
      const subId = parseInt(subcategoryId, 10);
      if (!isNaN(subId)) {
        updateData.subcategoryId = subId;
        // Verify subcategory exists and link category
        const subcat = await Subcategory.findByPk(subId);
        if (subcat && subcat.categoryId) {
          updateData.categoryId = subcat.categoryId;
        }
      }
    }

    if (keywords !== undefined) updateData.keywords = keywords;
    if (imageUrls.length > 0) {
      updateData.images = imageUrls;
      updateData.coverImage = imageUrls[0];
      updateData.galleryImages = imageUrls.slice(1);
    } else if (req.body.removeCoverImage === 'true' && (!req.body.existingGalleryImages || JSON.parse(req.body.existingGalleryImages || '[]').length === 0)) {
      // Handle case where all images are removed
      updateData.images = [];
      updateData.coverImage = null;
      updateData.galleryImages = [];
    }

    // Pack dimensions
    const dimensions = {
      length: length !== undefined ? length : (product.dimensions?.length || null),
      width: width !== undefined ? width : (product.dimensions?.width || null),
      height: height !== undefined ? height : (product.dimensions?.height || null)
    };
    updateData.dimensions = dimensions;

    // Pack extra logistics
    const currentLogistics = product.logistics || {};
    const updatedLogistics = {
      ...currentLogistics,
      deliveryFeeType: deliveryFeeType !== undefined ? deliveryFeeType : (currentLogistics.deliveryFeeType || 'flat'),
      deliveryCoverageZones: deliveryCoverageZones !== undefined ? (typeof deliveryCoverageZones === 'string' ? JSON.parse(deliveryCoverageZones) : deliveryCoverageZones) : (deliveryZones !== undefined ? (typeof deliveryZones === 'string' ? JSON.parse(deliveryZones) : deliveryZones) : (currentLogistics.deliveryCoverageZones || currentLogistics.deliveryZones || [])),
      marketingStartDate: marketingStartDate ? marketingStartDate : (marketingStartDate === '' ? null : (currentLogistics.marketingStartDate || null)),
      marketingEndDate: marketingEndDate ? marketingEndDate : (marketingEndDate === '' ? null : (currentLogistics.marketingEndDate || null))
    };
    updateData.logistics = updatedLogistics;

    // Pack extra attributes
    const currentAttributes = product.attributes || {};
    const physicalFeaturesAttributes = mergedTags.attributes; // Get physical features from mergedTags (can be undefined)

    // If physical features are provided (even empty object), use them as base to support deletion.
    // Otherwise fallback to current attributes.
    const baseAttributes = physicalFeaturesAttributes !== undefined ? physicalFeaturesAttributes : currentAttributes;

    const updatedAttributes = {
      ...baseAttributes,
      // Always preserve system attributes if not explicitly overwritten
      condition: condition !== undefined ? condition : (currentAttributes.condition || 'Brand New'),
      isBestSeller: isBestSeller !== undefined ? ([true, 'true', 1, '1'].includes(isBestSeller)) : (currentAttributes.isBestSeller || false)
    };
    updateData.attributes = updatedAttributes;

    // Update direct fields
    if (deliveryFee !== undefined) updateData.deliveryFee = parseFloat(deliveryFee);
    if (weight !== undefined) updateData.weight = weight ? weight : null;
    if (deliveryMethod !== undefined) updateData.deliveryMethod = deliveryMethod;
    if (deliveryCoverageZones !== undefined) updateData.deliveryCoverageZones = deliveryCoverageZones;
    else if (deliveryZones !== undefined) updateData.deliveryCoverageZones = deliveryZones;
    if (warranty !== undefined) updateData.warranty = warranty;
    if (returnPolicy !== undefined) updateData.returnPolicy = returnPolicy;

    // Store complex data in direct fields (NOT in tags) - same as createProduct
    if (keyFeatures !== undefined) updateData.keyFeatures = keyFeatures;
    if (specifications !== undefined) updateData.specifications = specifications;
    if (variants !== undefined) updateData.variants = variants;

    // Additional fields
    if (model !== undefined) updateData.model = model;
    if (sku !== undefined) updateData.sku = sku || null;
    if (barcode !== undefined) updateData.barcode = barcode || null;
    if (lowStockThreshold !== undefined) {
      const parsed = parseInt(lowStockThreshold, 10);
      updateData.lowStockThreshold = isNaN(parsed) ? 5 : parsed;
    }
    if (compareAtPrice !== undefined) {
      const parsed = parseFloat(compareAtPrice);
      updateData.compareAtPrice = isNaN(parsed) ? null : parsed;
    }
    if (cost !== undefined) {
      const parsed = parseFloat(cost);
      updateData.cost = isNaN(parsed) ? null : parsed;
    }

    // SEO fields
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle || null;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription || null;
    if (metaKeywords !== undefined) updateData.metaKeywords = metaKeywords || null;

    // Marketing fields
    if (marketingEnabled !== undefined || marketingCommission !== undefined || marketingCommissionType !== undefined) {
      const isMarkEnabled = marketingEnabled !== undefined ? (marketingEnabled === 'true' || marketingEnabled === true) : product.marketingEnabled;
      const type = marketingCommissionType || product.marketingCommissionType || 'flat';
      const inputComm = marketingCommission !== undefined ? parseFloat(marketingCommission) : (type === 'percentage' ? product.marketingCommissionPercentage : product.marketingCommission);
      let commValue = inputComm;
      let commPercentage = product.marketingCommissionPercentage || 0.00;

      if (isMarkEnabled) {
        if (type === 'percentage') {
          commPercentage = inputComm;
          const base = updateData.basePrice !== undefined ? updateData.basePrice : product.basePrice;
          const discount = updateData.discountPrice !== undefined ? updateData.discountPrice : (product.discountPrice || product.displayPrice || product.basePrice);
          const diff = Math.max(0, (parseFloat(discount) || 0) - (parseFloat(base) || 0));
          commValue = (diff * inputComm) / 100;
        } else {
          commPercentage = 0.00;
          commValue = inputComm;
        }
      }

      updateData.marketingEnabled = isMarkEnabled;
      updateData.marketingCommission = isNaN(commValue) ? 0.00 : commValue;
      updateData.marketingCommissionType = type;
      updateData.marketingCommissionPercentage = isNaN(commPercentage) ? 0.00 : commPercentage;

      if (req.body.marketingStartDate !== undefined) updateData.marketingStartDate = req.body.marketingStartDate || null;
      if (req.body.marketingEndDate !== undefined) updateData.marketingEndDate = req.body.marketingEndDate || null;
      if (req.body.marketingDuration !== undefined) updateData.marketingDuration = req.body.marketingDuration || null;
    }

    // Featured flag
    if (featured !== undefined || isFeatured !== undefined) {
      const featuredValue = featured === 'true' || featured === true || isFeatured === 'true' || isFeatured === true;
      updateData.featured = featuredValue;
      updateData.isFeatured = featuredValue;
    }

    // Flash sale fields
    if (isFlashSale !== undefined) {
      updateData.isFlashSale = isFlashSale === 'true' || isFlashSale === true;
    }
    if (flashSalePrice !== undefined) {
      const parsed = parseFloat(flashSalePrice);
      updateData.flashSalePrice = isNaN(parsed) ? null : parsed;
    }
    if (flashSaleStart !== undefined) {
      updateData.flashSaleStart = flashSaleStart ? new Date(flashSaleStart) : null;
    }
    if (flashSaleEnd !== undefined) {
      updateData.flashSaleEnd = flashSaleEnd ? new Date(flashSaleEnd) : null;
    }

    // Digital product fields
    if (isDigital !== undefined) {
      updateData.isDigital = isDigital === 'true' || isDigital === true || false;
    }
    if (downloadUrl !== undefined) {
      updateData.downloadUrl = downloadUrl || null;
    }

    // Save tags field
    if (Object.keys(mergedTags).length > 0) {
      updateData.tags = mergedTags;
    }

    // Status & Approval Workflow logic:
    // Super Admin / Admin updates go live immediately.
    // Seller / Service Provider updates revert to draft/pending for review.
    const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isPrivileged = userRole === 'superadmin' || userRole === 'admin';
    const isDraft = ['1', 'true', true].includes((req.body.draft ?? '').toString().toLowerCase());

    if (isPrivileged) {
      if (!isDraft) {
        updateData.status = 'active';
        updateData.approved = true;
        updateData.reviewStatus = 'approved';
      } else {
        updateData.status = 'draft';
        updateData.reviewStatus = 'draft';
      }
    } else {
      // Sellers / Service Providers / others
      // If they are updating, it must be reviewed again
      updateData.status = 'draft';
      updateData.approved = false;
      updateData.reviewStatus = 'pending';
    }

    // Check if category/brand/price changed - if so, recalculate related products
    const shouldRecalculateRelated = (
      updateData.categoryId && updateData.categoryId !== product.categoryId ||
      updateData.brand && updateData.brand !== product.brand ||
      updateData.basePrice && Math.abs(updateData.basePrice - product.basePrice) > product.basePrice * 0.1 // 10% price change
    );

    // Update the product
    await product.update(updateData);

    // Recalculate related products if significant changes were made
    if (shouldRecalculateRelated && product.approved) {
      relatedProductsModule.triggerCalculation(productId);
    }

    // Invalidate product-related cache when product is updated
    try {
      await cacheService.delPattern('products:*');
      console.log('[updateProduct] Invalidated product cache after update');
    } catch (cacheError) {
      console.warn('[updateProduct] Cache invalidation failed:', cacheError.message);
    }

    // Fetch updated product with seller and category info using eager loading
    const updatedProduct = await Product.findByPk(productId, {
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
      ]
    });

    res.status(200).json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    // Use global error handler
    next(error);
  }
};

const checkDuplicate = async (req, res) => {
  try {
    const { name: rawName, categoryId: rawCategoryId, excludeId } = req.query;
    const sellerId = req.user.id;
    const name = typeof rawName === 'string' ? rawName.trim() : rawName;

    if (!name || !rawCategoryId) {
      return res.status(400).json({
        message: 'Product name and category ID are required'
      });
    }

    let resolvedCategoryId = parseInt(rawCategoryId, 10);
    if (Number.isNaN(resolvedCategoryId)) {
      return res.status(400).json({ message: 'Invalid category ID format' });
    }

    const cat = await Category.findByPk(resolvedCategoryId);
    if (!cat) {
      return res.status(200).json({ duplicate: false, message: 'Category not found; skipping duplicate check' });
    }
    if (cat.parentId) {
      resolvedCategoryId = cat.parentId;
    }

    const whereClause = {
      sellerId,
      categoryId: resolvedCategoryId,
      [Op.and]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('name')),
          '=',
          String(name).toLowerCase().trim()
        )
      ]
    };

    if (excludeId) {
      whereClause.id = { [Op.ne]: parseInt(excludeId, 10) };
    }

    const existingProduct = await Product.findOne({ where: whereClause });

    res.status(200).json({
      duplicate: !!existingProduct,
      message: existingProduct
        ? 'You already have a product with this name in the selected category'
        : 'Product name is available'
    });
  } catch (error) {
    console.error('Error checking for duplicate products:', error);
    res.status(500).json({
      message: 'Server error while checking for duplicates',
      error: error.message
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body; // Require password for all deletions
    const productId = parseInt(id, 10);
    const userId = req.user.id;

    // Normalize user role
    const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isPrivileged = userRole === 'superadmin' || userRole === 'admin';

    console.log('Delete request for product:', productId, 'by user:', userId, 'Role:', userRole);

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    // Require password only for non-privileged users
    if (!isPrivileged && !password) {
      return res.status(400).json({ message: 'Password is required for deletion' });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    console.log('Product found:', product.name, 'approved:', product.approved);

    // Check permissions: seller can only delete their own unapproved products
    const isOwner = product.sellerId === userId;
    const canDelete = isPrivileged || (isOwner && !product.approved && product.reviewStatus === 'pending');

    console.log('Permissions - isOwner:', isOwner, 'canDelete:', canDelete);

    if (!canDelete) {
      return res.status(403).json({
        message: 'You can only delete your own products that are pending approval'
      });
    }

    // Verify password if provided (admins) or required (non-privileged)
    if ((!isPrivileged && !password) || (password)) {
      // If password provided, OR if required (implied), verify it
      if (password) {
        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        const bcrypt = require('bcryptjs');
        const isPasswordValid = await bcrypt.compare(password, user.password);
        console.log('Password verification result:', isPasswordValid);
        if (!isPasswordValid) {
          console.log(`Password verification failed for user ${userId} (${user.email})`);
          return res.status(401).json({ message: 'Invalid password' });
        }
      }
    }

    // Move product to recycle bin instead of hard delete
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    console.log('Creating deleted product record for product:', product.id);
    console.log('Product data:', JSON.stringify(product, null, 2));

    try {
      // Safely handle potentially null/undefined values
      const deletedProductData = {
        originalId: product.id,
        sellerId: product.sellerId,
        name: product.name || '',
        shortDescription: product.shortDescription || '',
        fullDescription: product.fullDescription || '',
        brand: product.brand || '',
        unitOfMeasure: product.unitOfMeasure || '',
        model: product.model || '',
        basePrice: parseFloat(product.basePrice) || 0,
        displayPrice: product.displayPrice ? parseFloat(product.displayPrice) : null,
        stock: parseInt(product.stock) || 0,
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
        images: JSON.stringify(product.galleryImages ? [product.coverImage, ...product.galleryImages] : [product.coverImage]),
        keyFeatures: JSON.stringify(Array.isArray(product.keyFeatures) ? product.keyFeatures : []),
        specifications: JSON.stringify(product.specifications || {}),
        attributes: JSON.stringify(product.attributes || {}),
        variants: JSON.stringify(Array.isArray(product.variants) ? product.variants : []),
        logistics: JSON.stringify(product.logistics || {}),
        deliveryMethod: product.deliveryMethod || 'Pickup',
        warranty: product.warranty || '',
        returnPolicy: product.returnPolicy || '',
        weight: product.weight || null,
        length: product.length || null,
        width: product.width || null,
        height: product.height || null,
        keywords: product.keywords || '',
        shareableLink: product.shareableLink || '',
        approved: Boolean(product.approved),
        reviewStatus: product.reviewStatus || 'pending',
        reviewNotes: product.reviewNotes || '',
        visibilityStatus: product.visibilityStatus || 'visible',
        relatedProducts: JSON.stringify(Array.isArray(product.relatedProducts) ? product.relatedProducts : []),
        deletionReason: req.body.deletionReason || 'Deleted by user',
        deletedAt: new Date(),
        autoDeleteAt: thirtyDaysFromNow
      };

      console.log('Deleted product data to insert:', JSON.stringify(deletedProductData, null, 2));

      const createdRecord = await DeletedProduct.create(deletedProductData);
      console.log('Deleted product record created successfully with ID:', createdRecord.id);
    } catch (createError) {
      console.error('Error creating deleted product record:', createError);
      console.error('Error details:', createError.message);
      console.error('Error stack:', createError.stack);
      throw createError;
    }

    // Invalidate product-related cache when product is deleted
    try {
      await cacheService.delPattern('products:*');
      console.log('[deleteProduct] Invalidated product cache after deletion');
    } catch (cacheError) {
      console.warn('[deleteProduct] Cache invalidation failed:', cacheError.message);
    }

    // Now delete the original product
    await product.destroy();

    res.status(200).json({
      message: 'Product deleted successfully.',
      productId: productId
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      message: 'Server error while deleting product',
      error: error.message
    });
  }
};

const toggleVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Toggle visibility status
    const newVisibilityStatus = product.visibilityStatus === 'hidden' ? 'visible' : 'hidden';

    await product.update({
      visibilityStatus: newVisibilityStatus
    });

    res.status(200).json({
      message: `Product ${newVisibilityStatus === 'hidden' ? 'hidden' : 'unhidden'} successfully`,
      product: product
    });
  } catch (error) {
    console.error('Error toggling product visibility:', error);
    res.status(500).json({
      message: 'Server error while toggling product visibility',
      error: error.message
    });
  }
};

const suspendProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id, 10);
    const { reason, duration, durationUnit, additionalNotes } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Suspension reason is required' });
    }

    if (!duration || parseInt(duration) <= 0) {
      return res.status(400).json({ message: 'Valid suspension duration is required' });
    }

    const product = await Product.findByPk(productId, {
      include: [{
        model: User,
        as: 'seller',
        attributes: ['id', 'name', 'email', 'businessName'],
        required: true
      }]
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Calculate suspension end time
    const suspensionEndTime = new Date();
    const durationValue = parseInt(duration);

    switch (durationUnit) {
      case 'hours':
        suspensionEndTime.setHours(suspensionEndTime.getHours() + durationValue);
        break;
      case 'days':
        suspensionEndTime.setDate(suspensionEndTime.getDate() + durationValue);
        break;
      case 'weeks':
        suspensionEndTime.setDate(suspensionEndTime.getDate() + durationValue * 7);
        break;
      case 'months':
        suspensionEndTime.setMonth(suspensionEndTime.getMonth() + durationValue);
        break;
      default:
        suspensionEndTime.setDate(suspensionEndTime.getDate() + durationValue); // Default to days
    }

    // Update product with suspension details
    await product.update({
      suspended: true,
      suspensionReason: reason.trim(),
      suspensionEndTime: suspensionEndTime,
      suspensionDuration: durationValue,
      suspensionDurationUnit: durationUnit,
      suspensionAdditionalNotes: additionalNotes ? additionalNotes.trim() : null,
      visibilityStatus: 'hidden' // Hide the product while suspended
    });

    // TODO: Send notification to seller about suspension
    // This would typically involve creating a notification record and/or sending an email

    res.status(200).json({
      message: 'Product suspended successfully. Notification sent to seller.',
      product: product,
      suspensionDetails: {
        reason: reason.trim(),
        duration: durationValue,
        durationUnit,
        endTime: suspensionEndTime,
        additionalNotes: additionalNotes ? additionalNotes.trim() : null
      }
    });
  } catch (error) {
    console.error('Error suspending product:', error);
    res.status(500).json({
      message: 'Server error while suspending product',
      error: error.message
    });
  }
};

const requestProductDeletion = async (req, res) => {
  try {
    const { productId, reason, password } = req.body;
    const sellerId = req.user.id;

    if (!productId || !reason || !password) {
      return res.status(400).json({
        message: 'Product ID, reason, and password are required'
      });
    }

    // Verify password
    const user = await User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Check if product exists and belongs to seller
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.sellerId !== sellerId) {
      return res.status(403).json({ message: 'You can only request deletion for your own products' });
    }

    if (!product.approved) {
      return res.status(400).json({ message: 'Use direct delete for unapproved products' });
    }

    // Check if there's already a pending deletion request
    const existingRequest = await ProductDeletionRequest.findOne({
      where: {
        productId,
        status: 'pending'
      }
    });

    if (existingRequest) {
      return res.status(409).json({ message: 'A deletion request for this product is already pending' });
    }

    // Create deletion request
    const deletionRequest = await ProductDeletionRequest.create({
      productId,
      sellerId,
      reason: reason.trim()
    });

    res.status(201).json({
      message: 'Product deletion request submitted successfully. It will be reviewed by an admin.',
      request: deletionRequest
    });
  } catch (error) {
    console.error('Error requesting product deletion:', error);
    res.status(500).json({
      message: 'Server error while processing deletion request',
      error: error.message
    });
  }
};

const getDeletedProducts = async (req, res) => {
  try {
    const sellerId = req.user.id;
    console.log('Fetching deleted products for seller:', sellerId);

    const isAdmin = ['super_admin', 'superadmin', 'admin'].includes(req.user.role);
    console.log('Fetching deleted products. Admin mode:', isAdmin);

    const where = isAdmin ? {} : { sellerId };
    const deletedProducts = await DeletedProduct.findAll({
      where,
      include: [{
        model: User,
        as: 'seller',
        attributes: ['id', 'name', 'email', 'businessName'],
        required: false
      }],
      order: [['deletedAt', 'DESC']]
    });

    console.log('Found deleted products:', deletedProducts.length);

    // Parse JSON fields for frontend
    const parsedProducts = deletedProducts.map(product => {
      const plain = product.get({ plain: true });
      try {
        plain.images = JSON.parse(plain.images || '[]');
        plain.keyFeatures = JSON.parse(plain.keyFeatures || '[]');
        plain.specifications = JSON.parse(plain.specifications || '{}');
        plain.attributes = JSON.parse(plain.attributes || '{}');
        plain.variants = JSON.parse(plain.variants || '[]');
        plain.logistics = JSON.parse(plain.logistics || '{}');
        plain.relatedProducts = JSON.parse(plain.relatedProducts || '[]');
      } catch (parseError) {
        console.error('Error parsing JSON fields for product:', plain.id, parseError);
      }
      return plain;
    });

    res.status(200).json(parsedProducts);
  } catch (error) {
    console.error('Error fetching deleted products:', error);
    res.status(500).json({
      message: 'Server error while fetching deleted products',
      error: error.message
    });
  }
};

const restoreProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required for restoration' });
    }

    // Verify password
    const user = await User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Find the deleted product
    const deletedProduct = await DeletedProduct.findByPk(id);
    if (!deletedProduct) {
      return res.status(404).json({ message: 'Deleted product not found' });
    }

    const isAdmin = ['super_admin', 'superadmin', 'admin'].includes(req.user.role);

    if (!isAdmin && deletedProduct.sellerId !== sellerId) {
      return res.status(403).json({ message: 'You can only restore your own products' });
    }

    // Check if a product with the same name already exists in the same category
    const existingProduct = await Product.findOne({
      where: {
        sellerId,
        categoryId: deletedProduct.categoryId,
        name: deletedProduct.name
      }
    });

    if (existingProduct) {
      return res.status(409).json({
        message: 'A product with this name already exists in the same category. Please rename the product before restoring.'
      });
    }

    // Restore the product
    const restoredProduct = await Product.create({
      name: deletedProduct.name,
      shortDescription: deletedProduct.shortDescription,
      fullDescription: deletedProduct.fullDescription,
      brand: deletedProduct.brand,
      unitOfMeasure: deletedProduct.unitOfMeasure,
      model: deletedProduct.model,
      basePrice: deletedProduct.basePrice,
      displayPrice: deletedProduct.displayPrice,
      stock: deletedProduct.stock,
      categoryId: deletedProduct.categoryId,
      subcategoryId: deletedProduct.subcategoryId,
      images: deletedProduct.images,
      keyFeatures: deletedProduct.keyFeatures,
      specifications: deletedProduct.specifications,
      attributes: deletedProduct.attributes,
      variants: deletedProduct.variants,
      logistics: deletedProduct.logistics,
      deliveryMethod: deletedProduct.deliveryMethod,
      warranty: deletedProduct.warranty,
      returnPolicy: deletedProduct.returnPolicy,
      weight: deletedProduct.weight,
      length: deletedProduct.length,
      width: deletedProduct.width,
      height: deletedProduct.height,
      keywords: deletedProduct.keywords,
      shareableLink: deletedProduct.shareableLink,
      sellerId: deletedProduct.sellerId,
      approved: false, // Reset approval status
      reviewStatus: 'pending', // Reset to pending
      visibilityStatus: deletedProduct.visibilityStatus,
      relatedProducts: deletedProduct.relatedProducts
    });

    // Remove from recycle bin
    await deletedProduct.destroy();

    res.status(200).json({
      message: 'Product restored successfully',
      product: restoredProduct
    });
  } catch (error) {
    console.error('Error restoring product:', error);
    res.status(500).json({
      message: 'Server error while restoring product',
      error: error.message
    });
  }
};

const permanentlyDeleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required for permanent deletion' });
    }

    // Verify password
    const user = await User.findByPk(sellerId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Find the deleted product
    const deletedProduct = await DeletedProduct.findByPk(id);
    if (!deletedProduct) {
      return res.status(404).json({ message: 'Deleted product not found' });
    }

    const isAdmin = ['super_admin', 'superadmin', 'admin'].includes(req.user.role);

    if (!isAdmin && deletedProduct.sellerId !== sellerId) {
      return res.status(403).json({ message: 'You can only permanently delete your own products' });
    }

    // Permanently delete from recycle bin
    await deletedProduct.destroy();

    res.status(200).json({
      message: 'Product permanently deleted successfully'
    });
  } catch (error) {
    console.error('Error permanently deleting product:', error);
    res.status(500).json({
      message: 'Server error while permanently deleting product',
      error: error.message
    });
  }
};

// Admin function to migrate permanently deleted products back to recycle bin
const migrateDeletedProduct = async (req, res) => {
  try {
    const { originalId, sellerId, productData, deletionDate } = req.body;

    // Only admins can perform migration
    const userRoleStr = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'superadmin', 'super_admin', 'super-admin'].includes(userRoleStr)) {
      return res.status(403).json({ message: 'Only admins can perform product migration' });
    }

    // Check if product already exists in recycle bin
    const existingDeleted = await DeletedProduct.findOne({
      where: { originalId }
    });

    if (existingDeleted) {
      return res.status(409).json({ message: 'Product already exists in recycle bin' });
    }

    // Check if product still exists in main table
    const existingProduct = await Product.findByPk(originalId);
    if (existingProduct) {
      return res.status(409).json({ message: 'Product still exists in main products table' });
    }

    // Create deleted product record
    const deletedDate = deletionDate ? new Date(deletionDate) : new Date();
    const autoDeleteDate = new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const deletedProduct = await DeletedProduct.create({
      originalId,
      sellerId,
      ...productData,
      deletionReason: 'Migrated from permanent deletion',
      deletedAt: deletedDate,
      autoDeleteAt: autoDeleteDate
    });

    res.status(201).json({
      message: 'Product successfully migrated to recycle bin',
      deletedProduct
    });
  } catch (error) {
    console.error('Error migrating deleted product:', error);
    res.status(500).json({
      message: 'Server error while migrating product',
      error: error.message
    });
  }
};


module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  getSuperAdminProducts,
  getRecentlyApprovedProducts,
  getPendingProducts,
  approveProduct,
  rejectProduct,
  updateProduct,
  checkDuplicate,
  deleteProduct,
  toggleVisibility,
  suspendProduct,
  requestProductDeletion,
  getDeletedProducts,
  restoreProduct,
  permanentlyDeleteProduct,
  migrateDeletedProduct,
  getHomepageProducts
};

