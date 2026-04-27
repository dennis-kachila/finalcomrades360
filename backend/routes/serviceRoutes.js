const express = require('express');
const router = express.Router();
const { Service, ServiceImage, User, Category, Subcategory, Notification } = require('../models');
const { auth: authenticateToken, checkRole: requireRole, optionalAuth } = require('../middleware/auth');
const { uploadServiceImages } = require('../config/multer');
const { compressUploadedImages } = require('../utils/imageCompression');
const { getIO } = require('../realtime/socket');
const { getServiceProviderWallet } = require('../controllers/serviceProviderWalletController');
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

// Get all services with filters
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, userId, categoryId, subcategoryId, page = 1, limit = 10, userLat, userLng, sortBy = 'createdAt' } = req.query;

    const whereClause = {};

    // Check if user is admin/superadmin to allow viewing all statuses
    // Note: authenticateToken middleware is NOT on this route, so we check req.user if it exists
    const userRole = String(req.user?.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isAdmin = req.user && (userRole === 'admin' || userRole === 'superadmin');
    const isMarketing = req.query.marketing === 'true';

    if (isAdmin) {
      if (status) whereClause.status = status;
    } else {
      // Default for public: only show approved/active services
      // Note: 'approved' seems to be the main status, but let's allow 'active' too if the model uses it
      whereClause.status = { [require('sequelize').Op.or]: ['approved', 'active'] };

      // If not marketing mode, strictly enforce availability
      if (!isMarketing) {
        whereClause.isAvailable = true;
      }
    }

    // Explicitly filter for marketing-enabled items if in marketing mode
    if (isMarketing) {
      whereClause.marketingEnabled = true;
      whereClause.marketingCommission = { [require('sequelize').Op.gt]: 1 };
    }

    if (userId) whereClause.userId = userId;
    if (categoryId) whereClause.categoryId = categoryId;
    if (subcategoryId) whereClause.subcategoryId = subcategoryId;

    // Search Filter
    if (req.query.search || req.query.q) {
      const searchTerm = (req.query.search || req.query.q).trim();
      if (searchTerm) {
        const Op = require('sequelize').Op;
        const searchCondition = { [Op.like]: `%${searchTerm}%` };

        whereClause[Op.and] = [
          ...(whereClause[Op.and] || []),
          {
            [Op.or]: [
              { title: searchCondition },
              { description: searchCondition }
            ]
          }
        ];
      }
    }

    const services = await Service.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [[sortBy === 'distance' ? 'createdAt' : sortBy, 'DESC']] // Default sort, re-sorted below if distance
    });

    // Optimize response: Only return the first image for list view
    let sanitizedServices = services.rows.map(service => {
      const plainService = service.get({ plain: true });
      if (plainService.images && plainService.images.length > 0) {
        // Set cover image from first image
        plainService.coverImage = plainService.images[0].imageUrl;
        plainService.images = [plainService.images[0]];
      } else {
        plainService.coverImage = null;
      }
      // Calculate distance
      if (userLat && userLng) {
        if (plainService.vendorLat && plainService.vendorLng) {
          plainService.distance = calculateDistance(
            parseFloat(userLat),
            parseFloat(userLng),
            parseFloat(plainService.vendorLat),
            parseFloat(plainService.vendorLng)
          );
        } else {
          plainService.distance = null;
        }
      }
      return plainService;
    });

    // Sort by distance if requested
    if (userLat && userLng && sortBy === 'distance') {
      sanitizedServices.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    res.json({
      services: sanitizedServices,
      totalCount: services.count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(services.count / parseInt(limit)),
      pagination: {
        totalServices: services.count,
        totalCount: services.count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(services.count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Get service provider wallet data
router.get('/wallet', authenticateToken, getServiceProviderWallet);

// Get services by current user (for service providers)
router.get('/my-services', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    const services = await Service.findAll({
      where: { userId: user.id },
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Populate coverImage for each service
    const enhancedServices = services.map(service => {
      const plainService = service.get({ plain: true });
      if (plainService.images && plainService.images.length > 0) {
        plainService.coverImage = plainService.images[0].imageUrl;
      }
      return plainService;
    });

    // Group services by status
    const servicesByStatus = {
      pending: enhancedServices.filter(s => s.status === 'pending'),
      approved: enhancedServices.filter(s => s.status === 'approved'),
      suspended: enhancedServices.filter(s => s.status === 'suspended')
    };

    res.json(servicesByStatus);
  } catch (error) {
    console.error('Error fetching user services:', error);
    res.status(500).json({ error: 'Failed to fetch user services' });
  }
});

// Get pending services for admin approval
router.get('/pending', authenticateToken, async (req, res) => {
  const userRoleStr = String(req.user?.role || '').toLowerCase();
  if (!['admin', 'superadmin', 'super_admin', 'super-admin'].includes(userRoleStr)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const pendingServices = await Service.findAll({
      where: { status: 'pending' },
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    // Enhance with coverImage
    const enhancedPendingServices = pendingServices.map(service => {
      const plainService = service.get({ plain: true });
      if (plainService.images && plainService.images.length > 0) {
        plainService.coverImage = plainService.images[0].imageUrl;
      }
      return plainService;
    });

    res.json(enhancedPendingServices);
  } catch (error) {
    console.error('Error fetching pending services:', error);
    res.status(500).json({ error: 'Failed to fetch pending services' });
  }
});

// Get single service by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findByPk(id, {
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ]
    });

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check visibility: only approved services are public
    // Admin/superadmin and the provider themselves can view it regardless of status
    const userRoleStr = String(req.user?.role || '').toLowerCase();
    const isAdmin = req.user && ['admin', 'superadmin', 'super_admin', 'super-admin'].includes(userRoleStr);
    const isOwner = req.user && req.user.id === service.userId;

    if (service.status !== 'approved' && !isAdmin && !isOwner) {
      return res.status(404).json({ error: 'Service not found / not yet approved' });
    }

    const plainService = service.get({ plain: true });
    if (plainService.images && plainService.images.length > 0) {
      plainService.coverImage = plainService.images[0].imageUrl;
    }

    res.json(plainService);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create new service
router.post('/', authenticateToken, uploadServiceImages.array('images', 5), compressUploadedImages, async (req, res) => {
  try {
    const user = req.user;

    // Only service providers can create services
    if (!['service_provider', 'admin', 'superadmin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Only service providers can create services' });
    }

    const {
      title,
      categoryId,
      subcategoryId,
      description,
      basePrice, // Changed from price
      deliveryTime,
      availability,
      location,
      isOnline,
      displayPrice,
      vendorLocation,
      vendorLat,
      vendorLng,
      discountPercentage,
      discountPrice
    } = req.body;
    const normalizedTitle = normalizeItemName(title);

    // Validate required fields
    if (!normalizedTitle || !categoryId || !subcategoryId || !description || !basePrice || !deliveryTime || !availability || !location || !displayPrice) {
      return res.status(400).json({ error: 'All required fields must be provided, including base price and display price' });
    }

    // Parse availabilityDays if provided
    let parsedAvailabilityDays = [];
    if (availabilityDays) {
      if (typeof availabilityDays === 'string') {
        try {
          parsedAvailabilityDays = JSON.parse(availabilityDays);
          if (typeof parsedAvailabilityDays === 'string' && (parsedAvailabilityDays.startsWith('[') || parsedAvailabilityDays.startsWith('{'))) {
            parsedAvailabilityDays = JSON.parse(parsedAvailabilityDays);
          }
        } catch (e) {
          console.error('Error parsing availabilityDays:', e);
        }
      } else {
        parsedAvailabilityDays = availabilityDays;
      }
    }

    // Calculate marketing commission
    let marketingCommissionPercentage = 0.00;
    let finalMarketingCommission = parseFloat(req.body.marketingCommission) || 0;
    const finalMarketingType = req.body.marketingCommissionType || 'flat';
    const isMarketingEnabled = req.body.marketingEnabled === 'true' || req.body.marketingEnabled === true;

    if (isMarketingEnabled) {
      if (finalMarketingType === 'percentage') {
        marketingCommissionPercentage = finalMarketingCommission;
        const price = discountPrice ? parseFloat(discountPrice) : (displayPrice ? parseFloat(displayPrice) : parseFloat(basePrice));
        const markup = Math.max(0, price - parseFloat(basePrice));
        finalMarketingCommission = (markup * marketingCommissionPercentage) / 100;
      } else {
        marketingCommissionPercentage = 0.00;
      }
    }

    // Create service with pending status
    const service = await Service.create({
      title: normalizedTitle,
      categoryId,
      subcategoryId,
      description,
      basePrice, // Changed from price
      deliveryTime,
      availability,
      location,
      isOnline: isOnline === 'true' || isOnline === true,
      isAvailable: req.body.isAvailable === undefined ? true : (req.body.isAvailable === 'true' || req.body.isAvailable === true),
      availabilityMode: req.body.availabilityMode || 'AUTO',
      availabilityDays: parsedAvailabilityDays,
      displayPrice,
      displayPrice,
      userId: user.id,
      addedBy: user.id, // Audit trail
      // Status management: super_admin/admin products are approved immediately
      status: (String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin' || String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin') ? 'approved' : 'pending',
      deliveryFeeType: req.body.deliveryFeeType || 'fixed',
      deliveryFee: req.body.deliveryFee || 0,
      deliveryCoverageZones: (function () {
        if (!req.body.deliveryCoverageZones) return [];
        let val = req.body.deliveryCoverageZones;
        if (typeof val === 'string') {
          try {
            let parsed = JSON.parse(val);
            if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
              parsed = JSON.parse(parsed);
            }
            return parsed;
          } catch (e) {
            console.error('Error parsing deliveryCoverageZones:', e);
            return [];
          }
        }
        return Array.isArray(val) ? val : [];
      })(),
      marketingCommission: finalMarketingCommission,
      marketingCommissionType: finalMarketingType,
      marketingCommissionPercentage: marketingCommissionPercentage,
      marketingDuration: req.body.marketingDuration || 30,
      marketingEnabled: isMarketingEnabled,
      marketingStartDate: req.body.marketingStartDate || null,
      marketingEndDate: req.body.marketingEndDate || null,
      vendorLocation,
      vendorLat,
      vendorLng,
      discountPercentage: parseFloat(discountPercentage) || 0,
      discountPrice: discountPrice ? parseFloat(discountPrice) : parseFloat(displayPrice)
    });

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(file =>
        ServiceImage.create({
          serviceId: service.id,
          imageUrl: `/uploads/services/${file.filename}`
        })
      );
      await Promise.all(imagePromises);
    }

    // Fetch the complete service with images
    const completeService = await Service.findByPk(service.id, {
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ]
    });

    res.status(201).json(completeService);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service
router.put('/:id', authenticateToken, uploadServiceImages.array('images', 5), compressUploadedImages, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check ownership or admin role
    const userRole = String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    if (service.userId !== user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to update this service' });
    }

    const {
      title,
      categoryId,
      subcategoryId,
      description,
      basePrice, // Changed from price
      deliveryTime,
      availability,
      location,
      isOnline,
      displayPrice,
      isAvailable, // Added isAvailable
      availabilityDays, // Added availabilityDays
      availabilityMode,
      deliveryFeeType, // Added deliveryFeeType
      deliveryFee, // Added deliveryFee
      deliveryCoverageZones, // Added deliveryCoverageZones
      marketingCommissionType, // Added marketingCommissionType
      marketingCommission,
      marketingDuration,
      marketingEnabled,
      marketingStartDate,
      marketingEndDate,
      vendorLocation,
      vendorLat,
      vendorLng,
      discountPercentage,
      discountPrice
    } = req.body;
    const normalizedTitle = title !== undefined ? normalizeItemName(title) : undefined;

    // Parse availabilityDays if provided
    let parsedAvailabilityDays = service.availabilityDays;
    if (availabilityDays !== undefined) {
      if (typeof availabilityDays === 'string') {
        try {
          parsedAvailabilityDays = JSON.parse(availabilityDays);
          if (typeof parsedAvailabilityDays === 'string' && (parsedAvailabilityDays.startsWith('[') || parsedAvailabilityDays.startsWith('{'))) {
            parsedAvailabilityDays = JSON.parse(parsedAvailabilityDays);
          }
        } catch (e) {
          console.error('Error parsing availabilityDays:', e);
        }
      } else {
        parsedAvailabilityDays = availabilityDays;
      }
    }

    // CRITICAL: Protect ownership fields
    if (req.body.userId || req.body.addedBy) {
      if (isAdmin) {
        console.log(`👤 [updateService] Admin modifying ownership (userId: ${req.body.userId}, addedBy: ${req.body.addedBy})`);
        if (req.body.userId) service.userId = parseInt(req.body.userId, 10);
        if (req.body.addedBy) service.addedBy = parseInt(req.body.addedBy, 10);
      } else {
        console.warn(`⚠️ [updateService] Unauthorized attempt to modify ownership fields (userId/addedBy) detected! Ignoring.`);
        delete req.body.userId;
        delete req.body.addedBy;
      }
    }

    // Update service
    await service.update({
      title: normalizedTitle !== undefined ? normalizedTitle : service.title,
      categoryId: categoryId !== undefined ? categoryId : service.categoryId,
      subcategoryId: subcategoryId !== undefined ? subcategoryId : service.subcategoryId,
      description: description !== undefined ? description : service.description,
      basePrice: basePrice !== undefined ? basePrice : service.basePrice,
      deliveryTime: deliveryTime !== undefined ? deliveryTime : service.deliveryTime,
      availability: availability !== undefined ? availability : service.availability,
      location: location !== undefined ? location : service.location,
      isOnline: isOnline !== undefined ? (isOnline === 'true' || isOnline === true) : service.isOnline,
      isAvailable: isAvailable !== undefined ? (isAvailable === 'true' || isAvailable === true) : service.isAvailable,
      availabilityMode: availabilityMode !== undefined ? availabilityMode : service.availabilityMode,
      availabilityDays: parsedAvailabilityDays,
      displayPrice: displayPrice !== undefined ? displayPrice : service.displayPrice,
      deliveryFeeType: deliveryFeeType !== undefined ? deliveryFeeType : service.deliveryFeeType,
      deliveryFee: deliveryFee !== undefined ? deliveryFee : service.deliveryFee,
      deliveryCoverageZones: (function () {
        if (deliveryCoverageZones === undefined) return service.deliveryCoverageZones;
        if (typeof deliveryCoverageZones === 'string') {
          try {
            let parsed = JSON.parse(deliveryCoverageZones);
            if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
              parsed = JSON.parse(parsed);
            }
            return parsed;
          } catch (e) {
            console.error('Error parsing deliveryCoverageZones:', e);
            return service.deliveryCoverageZones;
          }
        }
        return Array.isArray(deliveryCoverageZones) ? deliveryCoverageZones : service.deliveryCoverageZones;
      })(),
      marketingCommissionType: marketingCommissionType !== undefined ? marketingCommissionType : service.marketingCommissionType,
      marketingCommissionPercentage: (() => {
        let type = marketingCommissionType !== undefined ? marketingCommissionType : service.marketingCommissionType;
        let isEnabled = marketingEnabled !== undefined ? (marketingEnabled === 'true' || marketingEnabled === true) : service.marketingEnabled;
        if (isEnabled && type === 'percentage') {
          return marketingCommission !== undefined ? parseFloat(marketingCommission) : service.marketingCommissionPercentage;
        }
        return 0.00;
      })(),
      marketingCommission: (() => {
        let type = marketingCommissionType !== undefined ? marketingCommissionType : service.marketingCommissionType;
        let isEnabled = marketingEnabled !== undefined ? (marketingEnabled === 'true' || marketingEnabled === true) : service.marketingEnabled;
        let inputComm = marketingCommission !== undefined ? parseFloat(marketingCommission) : (type === 'percentage' ? service.marketingCommissionPercentage : service.marketingCommission);

        if (isEnabled && type === 'percentage') {
          const price = discountPrice !== undefined ? parseFloat(discountPrice) : (service.discountPrice || service.displayPrice || service.basePrice || 0);
          const basePriceValue = basePrice !== undefined ? parseFloat(basePrice) : (service.basePrice || 0);
          const markup = Math.max(0, price - basePriceValue);
          return (markup * inputComm) / 100;
        }
        return isNaN(inputComm) ? 0.00 : inputComm;
      })(),
      marketingDuration: marketingDuration !== undefined ? marketingDuration : service.marketingDuration,
      marketingEnabled: marketingEnabled !== undefined ? (marketingEnabled === 'true' || marketingEnabled === true) : service.marketingEnabled,
      marketingStartDate: marketingStartDate !== undefined ? (marketingStartDate === '' ? null : marketingStartDate) : service.marketingStartDate,
      marketingEndDate: marketingEndDate !== undefined ? (marketingEndDate === '' ? null : marketingEndDate) : service.marketingEndDate,
      vendorLocation: vendorLocation !== undefined ? vendorLocation : service.vendorLocation,
      vendorLat: vendorLat !== undefined ? vendorLat : service.vendorLat,
      vendorLng: vendorLng !== undefined ? vendorLng : service.vendorLng,
      discountPercentage: discountPercentage !== undefined ? parseFloat(discountPercentage) : service.discountPercentage,
      discountPrice: discountPrice !== undefined ? parseFloat(discountPrice) : service.discountPrice,
      // Status & Approval Workflow logic for update:
      // Super Admin / Admin updates stay approved.
      // Sellers / Others revert to pending for review.
      status: (String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'admin' || String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'superadmin') ? service.status : 'pending'
    });

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(file =>
        ServiceImage.create({
          serviceId: service.id,
          imageUrl: `/uploads/services/${file.filename}`
        })
      );
      await Promise.all(imagePromises);
    }

    // Fetch updated service
    const updatedService = await Service.findByPk(service.id, {
      include: [
        {
          model: ServiceImage,
          as: 'images'
        },
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Category,
          as: 'category'
        },
        {
          model: Subcategory,
          as: 'subcategory'
        }
      ]
    });

    res.json(updatedService);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Approve service (admin only)
router.patch('/:id/approve', authenticateToken, requireRole(['admin', 'superadmin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await service.update({ status: 'approved' });

    // --- NOTIFICATION START ---
    try {
      const title = 'Service Approved';
      const message = `Your service "${service.title}" has been approved and is now live.`;

      const notification = await Notification.create({
        userId: service.userId,
        title,
        message,
        type: 'service_approval'
      });

      const io = getIO();
      if (io) {
        io.to(`user:${service.userId}`).emit('notification:new', notification);
      }
    } catch (notifError) {
      console.error('Error sending service approval notification:', notifError);
    }
    // --- NOTIFICATION END ---

    res.json({ message: 'Service approved successfully', service });
  } catch (error) {
    console.error('Error approving service:', error);
    res.status(500).json({ error: 'Failed to approve service' });
  }
});

// Suspend service (admin only)
router.patch('/:id/suspend', authenticateToken, requireRole(['admin', 'superadmin', 'super_admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await service.update({
      status: 'suspended',
      suspensionReason: reason
    });

    // --- NOTIFICATION START ---
    try {
      const title = 'Service Suspended';
      const message = `Your service "${service.title}" has been suspended.${reason ? ` Reason: ${reason}` : ''}`;

      const notification = await Notification.create({
        userId: service.userId,
        title,
        message,
        type: 'service_suspension'
      });

      const io = getIO();
      if (io) {
        io.to(`user:${service.userId}`).emit('notification:new', notification);
      }
    } catch (notifError) {
      console.error('Error sending service suspension notification:', notifError);
    }
    // --- NOTIFICATION END ---

    res.json({ message: 'Service suspended successfully', service });
  } catch (error) {
    console.error('Error suspending service:', error);
    res.status(500).json({ error: 'Failed to suspend service' });
  }
});

// Delete service image
router.delete('/:serviceId/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { serviceId, imageId } = req.params;
    const user = req.user;

    const service = await Service.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check ownership or admin role
    const userRole = String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    if (service.userId !== user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete images from this service' });
    }

    const image = await ServiceImage.findByPk(imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    await image.destroy();

    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting service image:', error);
    res.status(500).json({ error: 'Failed to delete service image' });
  }
});

// Delete service
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const service = await Service.findByPk(id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check ownership or admin role
    const userRole = String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    if (service.userId !== user.id && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this service' });
    }

    await service.destroy();

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

module.exports = router;