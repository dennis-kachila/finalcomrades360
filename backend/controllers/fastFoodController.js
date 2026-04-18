const { FastFood, User, Category, Subcategory, Cart, sequelize } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { optimizeImage } = require('../utils/imageValidation');
const { normalizeItemName } = require('../utils/itemNamePolicy');

// Helper function to calculate distance using Haversine formula
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return parseFloat(d.toFixed(2));
};

const deg2rad = (deg) => {
    return deg * (Math.PI / 180);
};

const normalizeDeliveryFee = (rawValue) => {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return null;
    }

    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed) || parsed < 0) {
        return null;
    }

    return Number(parsed.toFixed(2));
};

const syncApprovedSellerDeliveryFee = async ({ vendorId, deliveryFee, sourceItemId = null }) => {
    if (!vendorId || deliveryFee === null) {
        return;
    }

    const where = {
        vendor: vendorId,
        [Op.or]: [
            { approved: true },
            { reviewStatus: 'approved' },
            { hasBeenApproved: true }
        ]
    };

    if (sourceItemId) {
        where.id = { [Op.ne]: sourceItemId };
    }

    await FastFood.update(
        { deliveryFee },
        { where }
    );

    // Also update all items in Carts for this vendor to ensure live data consistency
    // This handles users who already have these items in their cart
    await Cart.update(
        { deliveryFee },
        { 
            where: { 
                itemType: 'fastfood',
                [Op.or]: [
                    { fastFoodId: { [Op.in]: sequelize.literal(`(SELECT id FROM FastFoods WHERE vendor = ${vendorId})`) } }
                ]
            } 
        }
    );
};

// Get all fast food items
exports.getAllFastFoods = async (req, res) => {
    try {
        const { category, subcategoryId, vendor, search, limit, page, minPrice, maxPrice, isFeatured, userLat, userLng, sortBy = 'createdAt', includeInactive } = req.query;

        console.log(`🔍 [getAllFastFoods] Request: page=${page}, limit=${limit}, sortBy=${sortBy}`);

        const queryOptions = {
            where: {},
            // Use provided sort unless it's 'distance', then fall back to createdAt for DB query
            order: [[sortBy === 'distance' ? 'createdAt' : sortBy, 'DESC']],
            // Include review status fields explicitly
            attributes: {
                include: ['reviewStatus', 'hasBeenApproved']
            }
        };

        // Check if user is admin/superadmin with robust normalization
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSuperAdmin = userRole === 'superadmin';
        const isPrivileged = userRole === 'admin' || isSuperAdmin;

        // Check if explicit public view is requested
        const isPublicView = req.query.view === 'public';

        // browseAll=true: show all approved items regardless of isAvailable (includes closed shops)
        const isBrowseAll = req.query.browseAll === 'true';

        // Strict filters for public-facing queries
        // MODIFIED: If marketing=true is passed, allow viewing items regardless of isActive/isAvailable
        // so marketers can pre-share approved items that may not be currently "open"
        const isMarketing = req.query.marketing === 'true';

        if (!isPrivileged || isPublicView) {
            // In marketing mode: skip isActive requirement (marketers can share approved-but-closed items)
            if (!isMarketing) {
                queryOptions.where.isActive = true;
            }

            // Allow items that are either approved via the boolean OR have status/reviewStatus 'approved'/'active'
            queryOptions.where[Op.or] = [
                { approved: true },
                { status: { [Op.in]: ['approved', 'active'] } },
                { reviewStatus: { [Op.in]: ['approved', 'active'] } }
            ];

            // browseAll mode: skip isAvailable filter so closed-shop items are visible
            // Only enforce availability for regular shoppers (not marketers, not browseAll)
            if (!isMarketing && !isBrowseAll) {
                queryOptions.where.isAvailable = true;
            }
        } else {
            // Admin can see all items, optionally filter inactive
            if (includeInactive === 'false') {
                queryOptions.where.isActive = true;
                queryOptions.where.isAvailable = true;
            }
        }

        if (category) queryOptions.where.category = category;
        if (subcategoryId) queryOptions.where.subcategoryId = subcategoryId;
        if (vendor) queryOptions.where.vendor = vendor;
        if (isFeatured) queryOptions.where.isFeatured = isFeatured === 'true';

        // Fix: If in marketing mode, explicitly filter for marketing-enabled items
        // This ensures the pagination returns relevant items, not just the newest items that might not have marketing enabled.
        if (isMarketing) {
            queryOptions.where.marketingEnabled = true;
            // Also ensure we only fetch items with commission > 1 as requested
            queryOptions.where.marketingCommission = { [Op.gt]: 1 };
        }

        if (search) {
            const searchCondition = {
                [Op.or]: [
                    { name: { [Op.like]: `%${search}%` } },
                    { shortDescription: { [Op.like]: `%${search}%` } }
                ]
            };

            if (queryOptions.where[Op.or]) {
                // If we already have an Op.or (for approval), we must wrap both in an Op.and
                const existingOr = queryOptions.where[Op.or];
                delete queryOptions.where[Op.or];
                queryOptions.where[Op.and] = [
                    { [Op.or]: existingOr },
                    searchCondition
                ];
            } else {
                queryOptions.where[Op.or] = searchCondition[Op.or];
            }
        }

        if (minPrice || maxPrice) {
            queryOptions.where.basePrice = {};
            if (minPrice) queryOptions.where.basePrice[Op.gte] = minPrice;
            if (maxPrice) queryOptions.where.basePrice[Op.lte] = maxPrice;
        }

        // Pagination
        if (limit && page) {
            queryOptions.limit = parseInt(limit);
            queryOptions.offset = (parseInt(page) - 1) * parseInt(limit);
        }

        // Include vendor details
        queryOptions.include = [
            {
                model: User,
                as: 'vendorDetail',
                attributes: ['id', 'name', 'email', 'phone', 'businessName']
            }
        ];

        console.log('🔍 [getAllFastFoods] Executing DB Query...');
        const { count, rows: fastFoodsRaw } = await FastFood.findAndCountAll(queryOptions);
        console.log(`✅ [getAllFastFoods] DB Success: Found ${count} items (Page ${page})`);

        // Convert to plain objects to add distance
        let fastFoods = fastFoodsRaw.map(item => item.get({ plain: true }));

        // Calculate distance if coordinates provided
        if (userLat && userLng) {
            try {
                fastFoods = fastFoods.map(item => {
                    if (item.vendorLat && item.vendorLng) {
                        item.distance = calculateDistance(
                            parseFloat(userLat),
                            parseFloat(userLng),
                            parseFloat(item.vendorLat),
                            parseFloat(item.vendorLng)
                        );
                    } else {
                        item.distance = null;
                    }
                    return item;
                });

                // Sort by distance if requested
                if (sortBy === 'distance') {
                    fastFoods.sort((a, b) => {
                        if (a.distance === null) return 1;
                        if (b.distance === null) return -1;
                        return a.distance - b.distance;
                    });
                }
            } catch (distError) {
                console.error('⚠️ [getAllFastFoods] Distance calculation error:', distError);
                // Fail gracefully: Just don't sort/calculate distance
            }
        }

        const totalPages = limit ? Math.ceil(count / parseInt(limit)) : 1;

        console.log(`📦 [getAllFastFoods] Returning IDs: [${fastFoods.map(f => f.id).join(', ')}]`);

        res.status(200).json({
            success: true,
            count: fastFoods.length, // Items on THIS page
            totalCount: count, // Total items matching query
            totalPages: totalPages,
            currentPage: page ? parseInt(page) : 1,
            data: fastFoods
        });
    } catch (error) {
        console.error('❌ [getAllFastFoods] CRASH:', error);
        res.status(500).json({ success: false, message: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
};

// Get single fast food item
exports.getFastFoodById = async (req, res) => {
    try {
        const fastFood = await FastFood.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'vendorDetail',
                    attributes: ['id', 'name', 'email', 'phone', 'businessName']
                }
            ]
        });
        if (!fastFood) {
            return res.status(404).json({ success: false, message: 'Fast food item not found' });
        }

        // Check visibility: only approved and active items are public
        // Admin/superadmin and the vendor themselves can view it regardless of approval
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSuperAdmin = userRole === 'superadmin';
        const isPrivileged = userRole === 'admin' || isSuperAdmin;
        
        // Fix: Robust type comparison and remove non-existent sellerId field
        const isOwner = req.user && String(req.user.id) === String(fastFood.vendor);

        // Fix: Align visibility logic with getAllFastFoods (allow status='active' or reviewStatus='approved'/'active')
        const isLive = (
            fastFood.approved || 
            ['approved', 'active'].includes(fastFood.status) || 
            ['approved', 'active'].includes(fastFood.reviewStatus)
        ) && fastFood.isActive && fastFood.isAvailable;

        console.log(`[getFastFoodById] ID=${req.params.id}: isLive=${isLive}, approved=${fastFood.approved}, status=${fastFood.status}, reviewStatus=${fastFood.reviewStatus}, isActive=${fastFood.isActive}, isAvailable=${fastFood.isAvailable}`);
        console.log(`[getFastFoodById] User: isPrivileged=${isPrivileged}, isOwner=${isOwner}`);

        if (!isLive && !isPrivileged && !isOwner) {
            return res.status(404).json({ success: false, message: 'Fast food item not found or not currently active' });
        }

        res.status(200).json({ success: true, data: fastFood });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create new fast food item
exports.createFastFood = async (req, res) => {
    try {
        const createData = { ...req.body };
        if (createData.name) {
            createData.name = normalizeItemName(createData.name);
        }

        // CRITICAL FIX: Always delete ID from create requests
        // If ID is present (even if null/undefined), Sequelize will use it instead of auto-incrementing
        delete createData.id;

        // Parse numeric fields properly
        ['basePrice', 'displayPrice', 'discountPrice', 'discountPercentage', 'preparationTimeMinutes', 'deliveryTimeEstimateMinutes', 'minOrderQty', 'maxOrderQty', 'marketingCommission', 'marketingDuration', 'vendorLat', 'vendorLng', 'dailyLimit'].forEach(field => {
            if (createData[field] !== undefined && createData[field] !== '' && createData[field] !== null) {
                createData[field] = (field === 'discountPrice' || field === 'displayPrice') ? Math.round(parseFloat(createData[field])) : parseFloat(createData[field]);
            } else if (createData[field] === '' || createData[field] === undefined) {
                createData[field] = null;
            }
        });

        // Ensure subcategoryId is an integer or null
        if (createData.subcategoryId && createData.subcategoryId !== '') {
            createData.subcategoryId = parseInt(createData.subcategoryId, 10);
        } else {
            createData.subcategoryId = null;
        }

        // Parse JSON fields
        ['sizeVariants', 'comboOptions', 'availabilityDays', 'ingredients', 'deliveryAreaLimits', 'tags', 'dietaryTags', 'galleryImages', 'deliveryCoverageZones', 'nutritionalInfo'].forEach(field => {
            if (createData[field]) {
                if (typeof createData[field] === 'string') {
                    try {
                        let parsed = JSON.parse(createData[field]);
                        // Handle potential double-stringification
                        if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
                            parsed = JSON.parse(parsed);
                        }
                        createData[field] = parsed;
                    } catch (e) {
                        console.error(`Error parsing ${field}:`, e);
                    }
                }
            }
        });

        // Ensure boolean parsing for multipart/form-data
        ['isActive', 'isAvailable', 'isFeatured', 'pickupAvailable', 'isComboOption', 'marketingEnabled'].forEach(field => {
            if (createData[field] !== undefined) {
                createData[field] = createData[field] === 'true' || createData[field] === true;
            }
        });

        // Handle empty strings for dates
        if (createData.marketingStartDate === '') createData.marketingStartDate = null;
        if (createData.marketingEndDate === '') createData.marketingEndDate = null;

        // 1. Handle Main Image
        if (req.files && req.files.mainImage && req.files.mainImage[0]) {
            const file = req.files.mainImage[0];
            // Compression middleware already optimized it to JPEG on disk
            createData.mainImage = `/uploads/other/${file.filename}`;
        } else if (!createData.mainImage) {
            createData.mainImage = '/uploads/default-food.jpg'; // Default
        }

        // 2. Handle Gallery Images
        if (req.files && req.files.galleryImages) {
            createData.galleryImages = req.files.galleryImages.map(file => `/uploads/products/${file.filename}`);
        } else if (createData.galleryImages && typeof createData.galleryImages === 'string') {
            try {
                createData.galleryImages = JSON.parse(createData.galleryImages);
            } catch (e) {
                console.error('Error parsing galleryImages:', e);
            }
        }

        // Status & Approval Workflow logic
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSuperAdmin = userRole === 'superadmin';
        const isPrivileged = userRole === 'admin' || isSuperAdmin;
        const isDraft = ['1', 'true', true].includes((req.body.draft ?? '').toString().toLowerCase());

        if (isPrivileged) {
            if (!isDraft) {
                // VALIDATION: displayPrice must be set before approval
                const displayPriceValue = parseFloat(createData.displayPrice || 0);
                const basePriceValue = parseFloat(createData.basePrice || 0);

                if (!createData.displayPrice || displayPriceValue <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'Display Price is required before approval. Please set a display price greater than 0.'
                    });
                }

                // VALIDATION: displayPrice must be >= basePrice
                if (displayPriceValue < basePriceValue) {
                    return res.status(400).json({
                        success: false,
                        message: `Display Price (${displayPriceValue} KES) cannot be less than Base Price (${basePriceValue} KES)`
                    });
                }

                // VALIDATION: discountPrice must be set before approval
                const discountPriceValue = parseFloat(createData.discountPrice || 0);
                if (!createData.discountPrice || discountPriceValue <= 0) {
                    // Try to calculate it if displayPrice is present
                    const calculatedDiscount = Math.round(displayPriceValue * (1 - parseFloat(createData.discountPercentage || 0) / 100));
                    if (calculatedDiscount <= 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Discount Price is required before approval. Please ensure Display Price and Discount Percentage are valid.'
                        });
                    }
                    createData.discountPrice = calculatedDiscount;
                }

                // AUTO-FILL: If location is missing, attempt to pull from Vendor's Business Profile
                if (!createData.vendorLocation || !createData.vendorLat || !createData.vendorLng) {
                    const vendorProfile = await User.findByPk(createData.vendor);
                    if (vendorProfile) {
                        createData.vendorLocation = createData.vendorLocation || vendorProfile.businessAddress;
                        createData.vendorLat = createData.vendorLat || vendorProfile.businessLat;
                        createData.vendorLng = createData.vendorLng || vendorProfile.businessLng;
                        console.log(`[createFastFood] Auto-filled location for vendor ${createData.vendor} from business profile.`);
                    }
                }

                // FINAL VALIDATION: Vendor Location (Mandatory for Smart Filtering)
                if (!createData.vendorLocation || !createData.vendorLat || !createData.vendorLng) {
                    return res.status(400).json({
                        success: false,
                        message: 'Vendor Location and Coordinates (Lat/Lng) are required for smart menu filtering. Vendor profile must be complete.'
                    });
                }

                // VALIDATION: deliveryFee must be set before approval
                // null = not set, 0 = free delivery, >0 = fee amount
                if (createData.deliveryFee === undefined || createData.deliveryFee === null || createData.deliveryFee === '') {
                    return res.status(400).json({
                        success: false,
                        message: 'Delivery Fee is required before approval. Set to 0 for free delivery or specify the fee amount.'
                    });
                }

                // Ensure deliveryFee is a valid number >= 0
                const deliveryFeeValue = normalizeDeliveryFee(createData.deliveryFee);
                if (deliveryFeeValue === null) {
                    return res.status(400).json({
                        success: false,
                        message: 'Delivery Fee must be a number greater than or equal to 0 (0 means free delivery).'
                    });
                }

                createData.deliveryFee = deliveryFeeValue;

                createData.approved = true;
                createData.reviewStatus = 'approved';
                createData.isActive = true;
                createData.hasBeenApproved = true;
            } else {
                createData.reviewStatus = 'draft';
            }
            // If vendor not specified by admin, default to themselves
            if (!createData.vendor) {
                createData.vendor = req.user.id;
            }
        } else {
            // Regular Sellers / Vendors
            createData.approved = false;
            createData.reviewStatus = 'pending';
            // Force vendor ID to be the authenticated user for non-privileged users
            createData.vendor = req.user.id;
        }

        // Audit Trail: explicit creator ID
        createData.addedBy = req.user.id;

        // Price Standardization Logic
        if (createData.discountPercentage === undefined) createData.discountPercentage = 0;
        let displayPriceValue = parseFloat(createData.displayPrice || 0);

        // For non-privileged users (sellers), we no longer force displayPrice = basePrice
        // This allows displayPrice to remain null until an admin sets it.
        if (displayPriceValue > 0) {
            createData.displayPrice = displayPriceValue;
            if (parseFloat(createData.discountPercentage) === 0) {
                createData.discountPrice = Math.round(displayPriceValue);
            } else if (!createData.discountPrice) {
                createData.discountPrice = Math.round(displayPriceValue * (1 - parseFloat(createData.discountPercentage) / 100));
            }
        } else if (isPrivileged) {
            // Admins must have a display price if they aren't saving a draft (already validated above)
            // If they are saving a draft, we can allow it to be null or default it if they provided one
            if (displayPriceValue > 0) createData.displayPrice = displayPriceValue;
        }

        // Final check for discountPrice before DB save
        if (!createData.discountPrice || parseFloat(createData.discountPrice) <= 0) {
            createData.discountPrice = Math.round(displayPriceValue);
        }

        // Calculate absolute commission if type is percentage
        if (createData.marketingEnabled) {
            const type = createData.marketingCommissionType || 'flat';
            const rate = parseFloat(createData.marketingCommission || 0);

            if (type === 'percentage') {
                createData.marketingCommissionPercentage = rate;
                // Hook in model will also handle this, but let's be explicit for the response
                const price = parseFloat(createData.discountPrice || createData.displayPrice || 0);
                const basePrice = parseFloat(createData.basePrice || 0);
                const markup = Math.max(0, price - basePrice);
                createData.marketingCommission = (markup * rate) / 100;
            } else {
                createData.marketingCommissionPercentage = 0.00;
                createData.marketingCommission = rate;
            }
        }

        const newItem = await FastFood.create(createData);

        if (newItem.approved || newItem.reviewStatus === 'approved') {
            const canonicalDeliveryFee = normalizeDeliveryFee(newItem.deliveryFee);
            await syncApprovedSellerDeliveryFee({
                vendorId: newItem.vendor,
                deliveryFee: canonicalDeliveryFee,
                sourceItemId: newItem.id
            });
            await newItem.reload();
        }

        res.status(201).json({ success: true, data: newItem });
    } catch (error) {
        console.error('Create FastFood Error:', {
            message: error.message,
            stack: error.stack,
            body: req.body,
            files: req.files ? Object.keys(req.files) : 'none'
        });
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                success: false,
                message: error.errors.map(e => e.message).join(', '),
                errors: error.errors
            });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// Update fast food item
exports.updateFastFood = async (req, res) => {
    try {
        const fastFood = await FastFood.findByPk(req.params.id);
        if (!fastFood) {
            return res.status(404).json({ success: false, message: 'Fast food item not found' });
        }

        // Check ownership or privileged role
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSuperAdmin = userRole === 'superadmin';
        const isPrivileged = userRole === 'admin' || isSuperAdmin;
        if (!isPrivileged && fastFood.vendor !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this item' });
        }


        // Handle file uploads if they exist (processed by multer middleware)
        const updateData = { ...req.body };

        // Never allow direct vendor/owner changes via this route for security.
        // It must be done via a dedicated transfer endpoint.
        if (updateData.vendorId) {
            delete updateData.vendorId;
        }
        if (updateData.vendor) {
            delete updateData.vendor;
        }

        if (updateData.name) {
            updateData.name = normalizeItemName(updateData.name);
        }

        // Parse numeric fields properly
        ['basePrice', 'displayPrice', 'discountPrice', 'discountPercentage', 'preparationTimeMinutes', 'deliveryTimeEstimateMinutes', 'minOrderQty', 'maxOrderQty', 'marketingCommission', 'marketingDuration', 'vendorLat', 'vendorLng', 'dailyLimit'].forEach(field => {
            if (updateData[field] !== undefined && updateData[field] !== '') {
                updateData[field] = (field === 'discountPrice' || field === 'displayPrice') ? Math.round(parseFloat(updateData[field])) : parseFloat(updateData[field]);
            } else if (updateData[field] === '') {
                updateData[field] = null;
            }
        });

        // Ensure subcategoryId is an integer or null
        if (updateData.subcategoryId && updateData.subcategoryId !== '') {
            updateData.subcategoryId = parseInt(updateData.subcategoryId, 10);
        } else if (updateData.subcategoryId === '') {
            updateData.subcategoryId = null;
        }

        // Parse JSON fields if they are strings (Multipart/form-data sends them as strings)
        ['sizeVariants', 'comboOptions', 'availabilityDays', 'ingredients', 'deliveryAreaLimits', 'tags', 'dietaryTags', 'existingGalleryImages', 'deliveryCoverageZones', 'nutritionalInfo'].forEach(field => {
            if (updateData[field] && typeof updateData[field] === 'string') {
                try {
                    let parsed = JSON.parse(updateData[field]);
                    // Handle potential double-stringification from frontend/axios
                    if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
                        parsed = JSON.parse(parsed);
                    }
                    updateData[field] = parsed;
                } catch (e) {
                    console.error(`Error parsing ${field}:`, e);
                    // Fallback to empty array if parsing fails for array fields
                    if (['sizeVariants', 'comboOptions', 'availabilityDays', 'ingredients', 'deliveryAreaLimits', 'tags', 'dietaryTags', 'existingGalleryImages'].includes(field)) {
                        updateData[field] = [];
                    }
                }
            }
        });

        // Ensure boolean parsing for multipart/form-data
        ['isActive', 'isAvailable', 'isFeatured', 'pickupAvailable', 'isComboOption', 'marketingEnabled'].forEach(field => {
            if (updateData[field] !== undefined) {
                updateData[field] = updateData[field] === 'true' || updateData[field] === true;
            }
        });

        // Handle empty strings for dates
        if (updateData.marketingStartDate === '') updateData.marketingStartDate = null;
        if (updateData.marketingEndDate === '') updateData.marketingEndDate = null;

        // 1. Handle Main Image
        if (req.files && req.files.mainImage && req.files.mainImage[0]) {
            const file = req.files.mainImage[0];
            // Compression middleware already optimized it to JPEG on disk
            updateData.mainImage = `/uploads/other/${file.filename}`;
        }

        // 2. Handle Gallery Images (Merging existing + new)
        let finalGalleryImages = [];
        let galleryUpdated = false;

        // Check if existingGalleryImages was PROVIDED (even if empty)
        if (updateData.existingGalleryImages !== undefined) {
            galleryUpdated = true;
            if (Array.isArray(updateData.existingGalleryImages)) {
                finalGalleryImages = [...updateData.existingGalleryImages];
            }
        } else if (fastFood.galleryImages) {
            // If not provided in request, keep what we have in DB
            const currentGallery = Array.isArray(fastFood.galleryImages) ? fastFood.galleryImages : [];
            finalGalleryImages = [...currentGallery];
        }

        // Add new uploaded files if any
        if (req.files && req.files.galleryImages) {
            galleryUpdated = true;
            const newImagePaths = req.files.galleryImages.map(file => `/uploads/products/${file.filename}`);
            finalGalleryImages = [...finalGalleryImages, ...newImagePaths];
        }

        // Assign to galleryImages only if there was an update attempt
        if (galleryUpdated) {
            updateData.galleryImages = finalGalleryImages;
        }

        // Clean up temporary fields
        delete updateData.existingGalleryImages;

        // Log reason for suspend actions (suspension is now handled by isActive)
        if (updateData.reason) {
            delete updateData.reason; // Don't save reason to database
        }

        // CRITICAL FIX: NEVER allow vendor field to be changed
        // The vendor field represents the original creator/owner and should NEVER be modified
        // Even if provided in the request body, remove it to preserve ownership
        // Even if provided in the request body, remove it to preserve ownership
        if (updateData.vendor !== undefined || updateData.addedBy !== undefined) {
            console.warn(`⚠️ [updateFastFood] Attempt to modify ownership fields detected! Ignoring. Original vendor: ${fastFood.vendor}, Attempted: ${updateData.vendor}`);
            delete updateData.vendor;
            delete updateData.addedBy;
        }

        // Status & Approval Workflow logic for update
        const isDraft = ['1', 'true', true].includes((req.body.draft ?? '').toString().toLowerCase());

        if (isPrivileged) {
            if (!isDraft) {
                // VALIDATION: displayPrice must be set before approval (only if we are approving or it is already approved)
                // We only run this validation if the item is GOING TO BE approved or IS approved.
                const newApprovalStatus = updateData.approved !== undefined ? updateData.approved : fastFood.approved;

                if (newApprovalStatus === true) {
                    const finalDisplayPriceForValidation = updateData.displayPrice !== undefined ? parseFloat(updateData.displayPrice) : parseFloat(fastFood.displayPrice || 0);
                    const finalBasePriceForValidation = updateData.basePrice !== undefined ? parseFloat(updateData.basePrice) : parseFloat(fastFood.basePrice || 0);
                    const finalDeliveryFeeForValidation = updateData.deliveryFee !== undefined
                        ? normalizeDeliveryFee(updateData.deliveryFee)
                        : normalizeDeliveryFee(fastFood.deliveryFee);

                    if (!finalDisplayPriceForValidation || finalDisplayPriceForValidation <= 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Display Price is required for approved items. Please set a display price greater than 0.'
                        });
                    }

                    if (finalDisplayPriceForValidation < finalBasePriceForValidation) {
                        return res.status(400).json({
                            success: false,
                            message: `Display Price (${finalDisplayPriceForValidation} KES) cannot be less than Base Price (${finalBasePriceForValidation} KES)`
                        });
                    }

                    // AUTO-FILL: If location is missing, attempt to pull from Vendor's Business Profile
                    if (!updateData.vendorLocation || !updateData.vendorLat || !updateData.vendorLng) {
                        const vendorProfile = await User.findByPk(fastFood.vendor);
                        if (vendorProfile) {
                            updateData.vendorLocation = updateData.vendorLocation || vendorProfile.businessAddress;
                            updateData.vendorLat = updateData.vendorLat || vendorProfile.businessLat;
                            updateData.vendorLng = updateData.vendorLng || vendorProfile.businessLng;
                            console.log(`[updateFastFood] Auto-filled location for vendor ${fastFood.vendor} from business profile.`);
                        }
                    }

                    // FINAL VALIDATION: Vendor Location (Mandatory for Smart Filtering)
                    if (!updateData.vendorLocation || !updateData.vendorLat || !updateData.vendorLng) {
                        return res.status(400).json({
                            success: false,
                            message: 'Vendor Location and Coordinates (Lat/Lng) are required for smart menu filtering. Vendor profile must be complete.'
                        });
                    }

                    updateData.deliveryFee = finalDeliveryFeeForValidation;
                }

                // CONDITIONAL APPROVAL: Only update these if explicitly provided in the request
                // This prevents "Set to Open" (availabilityMode update) from accidentally approving a pending item
                if (updateData.approved !== undefined) {
                    updateData.approved = updateData.approved; // already set by spread, but being explicit for logic flow
                }

                if (updateData.reviewStatus !== undefined) {
                    updateData.reviewStatus = updateData.reviewStatus;
                }

                // If it becomes approved, ensure hasBeenApproved is true
                if (updateData.approved === true || updateData.reviewStatus === 'approved') {
                    // FORCE SYNC: Ensure status string matches boolean
                    updateData.reviewStatus = 'approved';
                    updateData.approved = true;

                    // VALIDATION: discountPrice must be > 0 for approved items
                    const finalDisplay = updateData.displayPrice !== undefined ? parseFloat(updateData.displayPrice) : parseFloat(fastFood.displayPrice || 0);
                    const finalPct = updateData.discountPercentage !== undefined ? parseFloat(updateData.discountPercentage) : parseFloat(fastFood.discountPercentage || 0);
                    const finalDiscount = updateData.discountPrice !== undefined ? Math.round(parseFloat(updateData.discountPrice)) : (finalPct > 0 ? Math.round(finalDisplay * (1 - finalPct / 100)) : Math.round(finalDisplay));

                    if (finalDiscount <= 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Discount Price must be greater than 0 before approval.'
                        });
                    }

                    updateData.hasBeenApproved = true;
                    updateData.changes = []; // Clear changes log upon approval
                    // Also ensure it is active if approved
                    if (updateData.isActive === undefined) {
                        updateData.isActive = true;
                    }
                }
            } else {
                updateData.reviewStatus = 'draft';
            }
        } else {
            // Vendors / Sellers updating
            updateData.approved = false;
            updateData.reviewStatus = 'pending';
        }

        // Price Standardization Logic
        const finalDisplayPrice = updateData.displayPrice !== undefined ? parseFloat(updateData.displayPrice) : (fastFood.displayPrice ? parseFloat(fastFood.displayPrice) : 0);
        const finalDiscountPct = updateData.discountPercentage !== undefined ? parseFloat(updateData.discountPercentage) : parseFloat(fastFood.discountPercentage || 0);

        if (finalDisplayPrice > 0) {
            updateData.displayPrice = Math.round(finalDisplayPrice);
            if (finalDiscountPct === 0) {
                updateData.discountPrice = Math.round(finalDisplayPrice);
            } else if (!updateData.discountPrice && finalDiscountPct > 0) {
                updateData.discountPrice = Math.round(finalDisplayPrice * (1 - finalDiscountPct / 100));
            } else if (updateData.discountPrice) {
                updateData.discountPrice = Math.round(updateData.discountPrice);
            }
        }

        // Calculate absolute commission if type is percentage
        const isMarkEnabled = updateData.marketingEnabled !== undefined ? updateData.marketingEnabled : fastFood.marketingEnabled;
        if (isMarkEnabled && (updateData.marketingCommission !== undefined || updateData.marketingType !== undefined)) {
            const type = updateData.marketingCommissionType || fastFood.marketingCommissionType || 'flat';
            const inputComm = updateData.marketingCommission !== undefined ? parseFloat(updateData.marketingCommission) : (type === 'percentage' ? fastFood.marketingCommissionPercentage : fastFood.marketingCommission);

            if (type === 'percentage') {
                updateData.marketingCommissionPercentage = inputComm;
                const price = updateData.discountPrice || updateData.displayPrice || fastFood.discountPrice || fastFood.displayPrice || 0;
                const basePrice = updateData.basePrice || fastFood.basePrice || 0;
                const markup = Math.max(0, parseFloat(price) - parseFloat(basePrice));
                updateData.marketingCommission = (markup * inputComm) / 100;
            } else {
                updateData.marketingCommissionPercentage = 0.00;
                updateData.marketingCommission = inputComm;
            }
        }

        // FORCE CONSISTENCY: If reviewStatus is pending, approved MUST be false
        if (updateData.reviewStatus === 'pending') {
            console.log('🔒 [updateFastFood] Status is pending, forcing approved = false');
            updateData.approved = false;
        }

        console.log('💾 [updateFastFood] Saving update:', {
            id: fastFood.id,
            approved: updateData.approved,
            reviewStatus: updateData.reviewStatus,
            editorRole: userRole,
            isPrivileged
        });

        // CHANGE TRACKING: Capture differences for approved items edits
        // Track changes if it was previously approved AND (it's not a draft OR it's being sent to pending status)
        if (fastFood.hasBeenApproved && (!isDraft || updateData.reviewStatus === 'pending')) {
            const changes = [];
            // ... (tracking logic implied)
            // ... (tracking logic implied)
            // ...
            const fieldsToTrack = [
                'name', 'shortDescription', 'description', 'category', 'subcategoryId',
                'basePrice', 'displayPrice', 'preparationTimeMinutes', 'ingredients', 'tags',
                'deliveryTimeEstimateMinutes', 'deliveryFee', 'deliveryFeeType', 'deliveryAreaLimits', 'deliveryCoverageZones',
                'vendorLocation', 'vendorLat', 'vendorLng', 'kitchenVendor',
                'isActive', 'isAvailable', 'availabilityMode', 'availabilityDays',
                'sizeVariants', 'comboOptions', 'dietaryTags', 'allergens', 'nutritionalInfo',
                'spiceLevel', 'minOrderQty', 'maxOrderQty', 'estimatedServings', 'customizations',
                'marketingEnabled', 'marketingCommission', 'marketingCommissionType',
                'marketingStartDate', 'marketingEndDate', 'marketingDuration',
                'isFeatured', 'dailyLimit', 'pickupAvailable', 'pickupLocation'
            ];

            const areDifferent = (a, b) => {
                if (a === null && b === null) return false;
                if (a === undefined || b === undefined) return false; // Ignore undefined updates
                // Handle numbers (decimal strings vs floats)
                if (typeof a === 'number' || typeof b === 'number') {
                    return parseFloat(a) !== parseFloat(b);
                }
                if (typeof a === 'object' || Array.isArray(a)) {
                    return JSON.stringify(a) !== JSON.stringify(b);
                }
                return String(a).trim() !== String(b).trim();
            };

            fieldsToTrack.forEach(field => {
                if (updateData[field] !== undefined) {
                    const oldVal = fastFood[field];
                    const newVal = updateData[field];

                    // Specific check for arrays to avoid false positives on empty vs []
                    if (Array.isArray(oldVal) && Array.isArray(newVal) && oldVal.length === 0 && newVal.length === 0) return;

                    if (areDifferent(oldVal, newVal)) {
                        changes.push({
                            field,
                            oldValue: oldVal,
                            newValue: newVal
                        });
                    }
                }
            });

            // Image tracking
            if (updateData.mainImage && updateData.mainImage !== fastFood.mainImage) {
                changes.push({ field: 'mainImage', oldValue: fastFood.mainImage, newValue: updateData.mainImage });
            }
            if (updateData.galleryImages) {
                if (JSON.stringify(fastFood.galleryImages || []) !== JSON.stringify(updateData.galleryImages)) {
                    changes.push({ field: 'galleryImages', oldValue: fastFood.galleryImages, newValue: updateData.galleryImages });
                }
            }

            if (changes.length > 0) {
                updateData.changes = changes;
            }
        }

        await fastFood.update(updateData);

        const shouldSyncSellerDeliveryFee =
            (updateData.approved === true || updateData.reviewStatus === 'approved' || fastFood.approved === true || fastFood.reviewStatus === 'approved')
            && updateData.deliveryFee !== undefined;

        if (shouldSyncSellerDeliveryFee) {
            await syncApprovedSellerDeliveryFee({
                vendorId: fastFood.vendor,
                deliveryFee: normalizeDeliveryFee(updateData.deliveryFee),
                sourceItemId: fastFood.id
            });
        }

        // --- CACHE INVALIDATION ---
        // Clear homepage and fastfood list caches to ensure immediate visibility updates
        try {
            const cacheService = require('../scripts/services/cacheService');
            await cacheService.delPattern('homepage:*');
            console.log('🧹 [updateFastFood] Invalidated homepage cache');
        } catch (e) {
            console.error('⚠️ [updateFastFood] Failed to invalidate cache:', e.message);
        }
        await fastFood.reload(); // Force reload from DB to confirm changes

        res.status(200).json({ success: true, data: fastFood });
    } catch (error) {
        console.error('Update FastFood Error:', error);
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({
                success: false,
                message: error.errors.map(e => e.message).join(', '),
                errors: error.errors
            });
        }
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete fast food item
exports.deleteFastFood = async (req, res) => {
    try {
        const { reason } = req.body;
        const fastFood = await FastFood.findByPk(req.params.id);

        if (!fastFood) {
            return res.status(404).json({ success: false, message: 'Fast food item not found' });
        }

        // Check ownership or privileged role
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSuperAdmin = userRole === 'superadmin';
        const isPrivileged = userRole === 'admin' || isSuperAdmin;
        if (!isPrivileged && fastFood.vendor !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this item' });
        }

        // Log reason for audit/notification purposes
        if (reason) {
            // TODO: Send notification to vendor with reason
        }

        await fastFood.destroy();
        res.status(200).json({ success: true, message: 'Fast food item deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get vendor's fast food items
exports.getVendorFastFoods = async (req, res) => {
    try {
        console.log('🔍 getVendorFastFoods HIT');
        console.log('User ID:', req.user?.id, 'Role:', req.user?.role);

        let vendorId = req.params.vendorId;

        // If route is /vendor/me or vendorId is 'me', use authenticated user's ID
        if (!vendorId || vendorId === 'me' || req.path.includes('/vendor/me')) {
            vendorId = req.user.id;
        }

        console.log('Target Vendor ID:', vendorId);

        // Authorization Check
        const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isPrivileged = userRole === 'admin' || userRole === 'superadmin';

        if (String(vendorId) !== String(req.user.id) && !isPrivileged) {
            console.warn('⛔ Authorization Failed for getVendorFastFoods');
            return res.status(403).json({ success: false, message: 'Not authorized to view these items' });
        }

        console.log(`🔍 [getVendorFastFoods] Executing DB Query for vendor: ${vendorId}...`);

        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '1000', 10)));
        const { approved, reviewStatus } = req.query;

        const where = { vendor: vendorId };
        if (approved !== undefined) where.approved = approved === 'true';
        if (reviewStatus) where.reviewStatus = reviewStatus;

        const { count, rows } = await FastFood.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            raw: true
        });

        console.log(`✅ [getVendorFastFoods] DB Query Success: Found ${rows.length} of ${count} items`);

        res.status(200).json({
            data: rows,
            meta: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize)
            }
        });
    } catch (error) {
        console.error('getVendorFastFoods Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
