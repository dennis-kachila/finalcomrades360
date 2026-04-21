const jwt = require('jsonwebtoken');
const { User, Warehouse, PickupStation } = require('../models');

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
    console.log(`[auth] Token verified for user ID: ${decoded.id}`);

    if (decoded.userType === 'station_manager') {
      const stationType = decoded.stationType;
      const stationId = decoded.stationId;

      let station = null;
      if (stationType === 'warehouse') {
        station = await Warehouse.findByPk(stationId);
      } else if (stationType === 'pickup_station') {
        station = await PickupStation.findByPk(stationId);
      }

      if (!station || station.isActive === false) {
        return res.status(401).json({ message: 'Station account not found or inactive' });
      }

      const stationUser = {
        id: `station-${stationType}-${station.id}`,
        role: 'station_manager',
        roles: ['station_manager', stationType === 'warehouse' ? 'warehouse_manager' : 'pickup_station_manager'],
        name: station.name,
        email: station.contactEmail || null,
        isVerified: true,
        stationType,
        stationId: station.id,
        stationName: station.name,
        stationCode: station.code || null
      };

      req.user = stationUser;
      return next();
    }

    // Fetch current user data from database to get the most up-to-date role and verification status
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password', 'emailChangeToken', 'phoneOtp'] }
    });

    if (!user) {
      console.warn(`[auth] User not found in database for ID: ${decoded.id}`);
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.isDeactivated) {
      console.warn(`[auth] Account deactivated for user ID: ${decoded.id}`);
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    if (user.isFrozen) {
      console.warn(`[auth] Account frozen for user ID: ${decoded.id}`);
      return res.status(403).json({ message: 'Account is frozen. Contact super admin to unfreeze.' });
    }

    // Attach user to request
    req.user = user;
    console.log(`[auth] User attached: ID=${user.id}, Role=${user.role}, Roles=${JSON.stringify(user.roles)}`);

    // Check verification status based on user role and operation type
    console.log(`[auth] Checking verification bypass for: ${req.originalUrl} (path: ${req.path})`);
    // Allow unverified users to verify themselves and check their profile status
    const isVerificationOperation = (
      /(\/auth\/me|\/users\/me|\/users\/profile|\/users\/security|\/users\/login-history|\/users\/active-sessions|\/phone-otp|\/email-change|\/roles|\/role-applications|\/verification|\/upload|\/cart|\/wishlist|\/job-openings)/i.test(req.originalUrl) ||
      /(\/auth\/me|\/users\/me|\/users\/profile|\/users\/security|\/users\/login-history|\/users\/active-sessions|\/phone-otp|\/email-change|\/roles|\/role-applications|\/verification|\/upload|\/cart|\/wishlist|\/job-openings)/i.test(req.path) ||
      (req.method === 'POST' && (req.originalUrl.includes('role') || req.path.includes('role')))
    );

    console.log(`[auth] URL: ${req.originalUrl}, isVerificationOperation: ${isVerificationOperation}`);

    // For verification and role applications, allow users to proceed
    if (!isVerificationOperation) {
      const userRole = String(user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isPrivileged = userRole === 'admin' || userRole === 'superadmin' || userRole === 'opsmanager' || userRole === 'logisticsmanager' || userRole === 'financemanager';

      if (user.role === 'customer') {
        // ALLOW CUSTOMERS TO PROCEED EVEN IF UNVERIFIED
      } else if (!user.isVerified && !isPrivileged) {
        // Other roles (non-customer, non-admin) still need strict verification
        console.warn(`[auth] User unverified for user ID: ${decoded.id}`);
        return res.status(403).json({
          message: 'Account verification required. Please complete your role application approval.',
          code: 'VERIFICATION_REQUIRED'
        });
      }
    }

    next();
  } catch (err) {
    console.error('[auth] Token verification error:', err.message);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Basic admin check
const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role);
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  // Inclusive check for admin and all superadmin variants
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRole === 'super_admin' ||
    userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('super_admin');

  console.log(`[adminOnly] User ID: ${req.user.id}, Role: ${userRole}, Roles: ${JSON.stringify(userRoles)}, isAdmin: ${isAdmin}`);

  if (!isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

const adminOrLogistics = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role || '');
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isAuthorized = userRole === 'admin' || userRole === 'superadmin' || userRole === 'logisticsmanager' ||
    userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('logisticsmanager');

  if (!isAuthorized) {
    return res.status(403).json({ message: 'Admin or Logistics Manager access required' });
  }
  next();
};

const adminOrLogisticsOrSeller = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role || '');
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isAuthorized = userRole === 'admin' || userRole === 'superadmin' || userRole === 'logisticsmanager' || userRole === 'seller' ||
    userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('logisticsmanager') || userRoles.includes('seller');

  if (!isAuthorized) {
    return res.status(403).json({ message: 'Admin, Logistics Manager or Seller access required' });
  }

  // Role-specific suspension check
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRoles.includes('admin') || userRoles.includes('superadmin');
  if (!isAdmin && (userRole === 'seller' || userRoles.includes('seller')) && req.user.isSellerSuspended) {
    return res.status(403).json({ message: 'Your seller portal access has been suspended. You can still use the platform as a customer.' });
  }

  next();
};

const adminOrFinance = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role || '');
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isAuthorized = userRole === 'admin' || userRole === 'superadmin' || userRole === 'financemanager' ||
    userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('financemanager');

  if (!isAuthorized) {
    return res.status(403).json({ message: 'Admin or Finance Manager access required' });
  }
  next();
};

const adminOrSeller = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role || '');
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isAuthorized = userRole === 'admin' || userRole === 'superadmin' || userRole === 'seller' ||
    userRoles.includes('admin') || userRoles.includes('superadmin') || userRoles.includes('seller');

  if (!isAuthorized) {
    return res.status(403).json({ message: 'Admin or Seller access required' });
  }

  // Role-specific suspension check
  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRoles.includes('admin') || userRoles.includes('superadmin');
  if (!isAdmin && (userRole === 'seller' || userRoles.includes('seller')) && req.user.isSellerSuspended) {
    return res.status(403).json({ message: 'Your seller portal access has been suspended. You can still use the platform as a customer.' });
  }

  next();
};

// Optional authentication (doesn't block if no token)
const optionalAuth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return next();

  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret);
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password', 'emailChangeToken', 'phoneOtp'] }
    });

    if (user && !user.isDeactivated && !user.isFrozen) {
      req.user = user;
    }
    next();
  } catch (error) {
    // If token invalid, just proceed as guest
    next();
  }
};

// Role-based access control
const checkRole = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    const userRole = String(req.user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(r => String(r).toLowerCase().replace(/[^a-z0-9]/g, '')) : [userRole];
    const normalizedRequired = requiredRoles.map(r => String(r).toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Superadmin bypass (check both primary role and roles array)
    if (userRole === 'superadmin' || userRoles.includes('superadmin') || userRoles.includes('super_admin')) return next();

    if (normalizedRequired.length) {
      const hasRequiredRole = normalizedRequired.some(role => userRoles.includes(role) || userRole === role);
      if (!hasRequiredRole) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check for role-specific suspension
      const isAdmin = userRole === 'superadmin' || userRoles.includes('superadmin') || userRoles.includes('super_admin') || userRole === 'admin' || userRoles.includes('admin');
      if (!isAdmin) {
        if (normalizedRequired.includes('marketer') && req.user.isMarketerSuspended) {
          return res.status(403).json({ message: 'Your marketer portal access has been suspended.' });
        }
        if (normalizedRequired.includes('seller') && req.user.isSellerSuspended) {
          return res.status(403).json({ message: 'Your seller portal access has been suspended.' });
        }
        if (normalizedRequired.some(r => ['delivery', 'delivery_agent', 'driver'].includes(r)) && req.user.isDeliverySuspended) {
          return res.status(403).json({ message: 'Your delivery portal access has been suspended.' });
        }
      }
    }
    next();
  };
};

// Super admin only
const superAdminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role);
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || 
    userRoles.includes('superadmin') || userRoles.includes('super_admin');

  if (!isSuperAdmin) {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

/**
 * Middleware to ensure sellers have completed their business profile.
 * Redirects or blocks if required fields (address, phone, coordinates) are missing.
 */
const checkSellerProfile = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role || '');
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRoles.includes('admin') || userRoles.includes('superadmin');
  const isSeller = userRole === 'seller' || userRoles.includes('seller');

  // Skip check for non-sellers (Admins who are NOT sellers are skipped, but Admins who ARE sellers are caught)
  if (!isSeller) return next();

  // Perform completeness check
  if (!User.isSellerProfileComplete(req.user)) {
    return res.status(403).json({
      message: 'Seller profile incomplete. Please provide all business location details.',
      code: 'SELLER_PROFILE_INCOMPLETE'
    });
  }

  // Suspension check
  if (!isAdmin && req.user.isSellerSuspended) {
    return res.status(403).json({ message: 'Your seller portal access has been suspended.' });
  }

  next();
};

const authorize = checkRole; // Alias

// Marketer only
const marketerOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const normalize = (r) => String(r || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const userRole = normalize(req.user.role);
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(normalize) : [userRole];

  const isMarketer = userRole === 'marketer' || userRole === 'admin' || userRole === 'superadmin' ||
    userRoles.includes('marketer') || userRoles.includes('admin') || userRoles.includes('superadmin');

  if (!isMarketer) {
    return res.status(403).json({ message: 'Marketer access required' });
  }

  if (req.user.isMarketerSuspended) {
    return res.status(403).json({ message: 'Your marketer portal access has been suspended. You can still use the platform as a customer.' });
  }

  next();
};

// RBAC: role -> permissions
// Super Admin has implicit access to everything
const rolePermissions = {
  super_admin: ['*'],
  superadmin: ['*'],
  admin: ['*'],
  ops_manager: ['orders.view', 'orders.updateStatus', 'orders.assign'],
  logistics_manager: ['orders.view', 'orders.assign', 'orders.updateStatus'],
  finance_manager: ['orders.view', 'finance.manage'],
  delivery: ['orders.view', 'orders.updateStatus'],
  delivery_agent: ['orders.view', 'orders.updateStatus'],
  driver: ['orders.view', 'orders.updateStatus'],
  station_manager: ['orders.view', 'orders.updateStatus'],
  warehouse_manager: ['orders.view', 'orders.updateStatus'],
  pickup_station_manager: ['orders.view', 'orders.updateStatus']
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userRole = req.user.role;
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [userRole];

    // Collect all permissions from all roles
    let allPerms = [];
    userRoles.forEach(role => {
      const perms = rolePermissions[role] || [];
      allPerms = [...allPerms, ...perms];
    });

    if (allPerms.includes('*') || allPerms.includes(permission)) {
      // Check for delivery agent suspension if the permission is delivery-related
      const isDeliveryRole = userRoles.some(r => ['delivery', 'delivery_agent', 'driver'].includes(r));
      const isAdmin = userRole === 'admin' || userRole === 'superadmin' || userRoles.includes('admin') || userRoles.includes('superadmin');
      
      if (isDeliveryRole && !isAdmin && req.user.isDeliverySuspended) {
        return res.status(403).json({ message: 'Your delivery portal access has been suspended. You can still use the platform as a customer.' });
      }

      return next();
    }
    return res.status(403).json({ message: `Forbidden: missing permission ${permission}` });
  };
};

// Backward compatibility
const requireAdmin = adminOnly;

module.exports = {
  auth,
  authenticate: auth,
  adminOnly,
  optionalAuth,
  checkRole,
  authorize,
  superAdminOnly,
  requirePermission,
  rolePermissions,
  requireAdmin,
  marketerOnly,
  adminOrLogistics,
  adminOrLogisticsOrSeller,
  adminOrFinance,
  adminOrSeller,
  checkSellerProfile
};
