const express = require('express');
const router = express.Router();
const { User, RoleApplication } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../utils/mailer');
const { sendMessage } = require('../utils/messageService');
// Dynamically import json2csv to handle module loading issues, but stay quiet if it's missing
let Parser;
try {
  Parser = require('json2csv').Parser;
} catch (error) {
  // If json2csv is not installed, keep dev logs clean and only fail when export is actually used
  Parser = class {
    parse() { throw new Error('json2csv is not available'); }
  };
}

const generateReferralCode = () => `C360-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// POST /api/admin/users - Create a new user (Admin only)
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Name, email, phone, and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone }]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        message: existingUser.email === email
          ? 'User with this email already exists'
          : 'User with this phone number already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const publicId = uuidv4();
    const referralCode = generateReferralCode();

    // Create user
    const newUser = await User.create({
      name,
      email,
      phone,
      password: hashedPassword,
      publicId,
      referralCode,
      role: role || 'customer',
      // For role-based accounts, isVerified is automatically true since admin is creating them
      // For customer accounts, verification status is handled separately via email/phone verification
      isVerified: role && role !== 'customer' ? true : false
    });

    // Send welcome email with credentials
    const emailSubject = 'Your Comrades360 Account Has Been Created';
    const emailText = `Dear ${name},

Your Comrades360 account has been created successfully.

Login Credentials:
Email: ${email}
Password: ${password}

Please login at: https://comrades360.com/login

For security reasons, we recommend changing your password after your first login.

Best regards,
Comrades360 Team`;

    try {
      await sendEmail(email, emailSubject, emailText);
      console.log(`Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    // Send SMS notification
    const smsText = `Your Comrades360 account has been created successfully. Use email: ${email} and password: ${password} to login. Visit: https://comrades360.com/login`;

    try {
      await sendMessage(phone, smsText, 'sms');
      console.log(`Welcome SMS sent to ${phone}`);
    } catch (smsError) {
      console.error('Failed to send welcome SMS:', smsError);
    }

    // Remove password from response
    const userResponse = newUser.toJSON();
    delete userResponse.password;

    console.log(`Admin ${req.user.id} created new user ${newUser.id}`);

    res.status(201).json({
      message: 'User has been created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
});

// GET /api/admin/users - Get all users with filters
router.get('/users', auth, adminOnly, async (req, res) => {
  console.log('=== START /users route ===');
  console.log('Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query parameters:', JSON.stringify(req.query, null, 2));

  try {
    const { search, role, status, page = 1, limit = 20 } = req.query;
    const where = {};

    console.log('Processing with params:', { search, role, status, page, limit });

    // Add search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
      console.log('Applied search filter:', where[Op.or]);
    }

    // Add role filter
    if (role) {
      where.role = role;
      console.log('Applied role filter:', role);
    }

    // Add status filter
    if (status === 'active') {
      where.isDeactivated = false;
      console.log('Filtering for active users');
    } else if (status === 'inactive') {
      where.isDeactivated = true;
      console.log('Filtering for inactive users');
    }

    // Parse pagination parameters
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    console.log('Final query parameters:', { where, limit: limitNum, offset });

    // Test database connection
    console.log('Testing database connection...');
    try {
      await User.sequelize.authenticate();
      console.log('✅ Database connection successful');
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database connection error',
        error: dbError.message,
        code: 'DB_CONNECTION_ERROR'
      });
    }

    // Fetch users with pagination
    console.log('Fetching users from database...');
    let count, users;

    try {
      const result = await User.findAndCountAll({
        where,
        attributes: [
          'id', 'name', 'email', 'phone', 'role', 'isDeactivated', 'isFrozen',
          'emailVerified', 'phoneVerified', 'county', 'town', 'estate', 'houseNumber',
          'gender', 'campus', 'accessRestrictions', 'isVerified', 'createdAt', 'lastLogin'
        ],
        order: [['createdAt', 'DESC']],
        limit: limitNum,
        offset: offset
      });

      count = result.count;
      users = result.rows;
      console.log(`✅ Successfully fetched ${users.length} of ${count} total users`);

    } catch (queryError) {
      console.error('❌ Database query failed:', queryError);
      console.error('Query error details:', {
        name: queryError.name,
        message: queryError.message,
        sql: queryError.sql,
        parameters: queryError.parameters,
        stack: queryError.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: queryError.message,
        code: 'DB_QUERY_ERROR',
        ...(process.env.NODE_ENV === 'development' && {
          details: {
            name: queryError.name,
            sql: queryError.sql,
            parameters: queryError.parameters
          }
        })
      });
    }

    const totalPages = Math.ceil(count / limitNum);

    console.log('Sending response with users data');
    return res.json({
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
    console.error('❌ Unhandled error in /users route:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.original && { originalError: error.original })
    });

    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          name: error.name,
          stack: error.stack,
          ...(error.original && { originalError: error.original })
        }
      })
    });
  }
});

// PATCH /api/admin/users/:userId/role - Update user role
router.patch('/users/:userId/role', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (role === 'super_admin' && user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Cannot assign super_admin role' });
    }

    // Add new role to roles array
    let currentRoles = user.roles || ['customer'];
    if (!Array.isArray(currentRoles)) {
      currentRoles = [user.role || 'customer'];
    }
    const updatedRoles = [...new Set([...currentRoles, role])];

    // Update role
    await user.update({
      role,
      roles: updatedRoles
    });

    // If the current admin is super_admin, mark user as fully verified
    if (req.user && req.user.role === 'super_admin') {
      await user.update({
        emailVerified: true,
        phoneVerified: true,
        isVerified: true
      });
    }

    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Server error while updating user role.' });
  }
});

// POST /api/admin/verify-password - Verify super admin password
router.post('/verify-password', auth, adminOnly, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Get the current user's password hash
    const currentUser = await User.findByPk(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only super_admin can verify passwords
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admin can perform this action' });
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, currentUser.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    res.json({
      message: 'Password verified successfully',
      verified: true
    });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ message: 'Server error while verifying password.' });
  }
});

// PATCH /api/admin/users/:userId/freeze - Freeze/unfreeze user
router.patch('/users/:userId/freeze', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isFrozen, adminPassword } = req.body;

    if (!adminPassword) {
      return res.status(400).json({ message: 'Admin password is required' });
    }

    // Verify admin password first
    const currentUser = await User.findByPk(req.user.id);
    if (currentUser.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only super admin can perform this action' });
    }

    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(adminPassword, currentUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid admin password' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot freeze/unfreeze super_admin' });
    }

    // When a user is frozen, also deactivate their account so they cannot access the platform.
    // When unfrozen, reactivate them.
    await user.update({
      isFrozen,
      isDeactivated: !!isFrozen
    });

    res.json({
      message: `User ${isFrozen ? 'frozen' : 'unfrozen'} successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isFrozen: user.isFrozen,
        isDeactivated: user.isDeactivated
      }
    });
  } catch (error) {
    console.error('Error updating user freeze status:', error);
    res.status(500).json({ message: 'Server error while updating user freeze status.' });
  }
});

// PATCH /api/admin/users/:userId/status - Activate/deactivate user (legacy)
router.patch('/users/:userId/status', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isDeactivated } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot deactivate super_admin' });
    }

    await user.update({ isDeactivated });

    res.json({
      message: `User ${isDeactivated ? 'deactivated' : 'activated'} successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isDeactivated: user.isDeactivated
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error while updating user status.' });
  }
});

// PATCH /api/admin/users/:userId - Update user profile (full update)
router.patch('/users/:userId', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      name,
      email,
      phone,
      role,
      roles,
      county,
      town,
      estate,
      houseNumber,
      gender,
      campus,
      emailVerified,
      phoneVerified,
      accessRestrictions,
      isDeactivated,
      isFrozen,
      isVerified,
      banReason
    } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent changing super_admin role
    if (user.role === 'super_admin' && role && role !== 'super_admin') {
      return res.status(403).json({ message: 'Cannot change super_admin role' });
    }

    // Prevent deactivating/freezing super_admin
    if (user.role === 'super_admin' && (isDeactivated === true || isFrozen === true)) {
      return res.status(403).json({ message: 'Cannot deactivate or freeze super_admin' });
    }

    // Update user fields
    const updateData = {};
    if (name) updateData.name = name;
    
    // Only update email/phone if they actually changed (to avoid unnecessary uniqueness checks)
    if (email !== undefined && email !== user.email) updateData.email = email;
    if (phone !== undefined && phone !== user.phone) updateData.phone = phone;

    // Handle Roles
    if (roles && Array.isArray(roles)) {
      // If the frontend sends the whole roles array, use it directly (standardizes role management)
      updateData.roles = roles;
      // If a primary role isn't explicitly provided, default to the last one in the list or 'customer'
      if (!role) {
        updateData.role = roles[roles.length - 1] || 'customer';
      }
    }
    
    // If a single role is provided but roles array isn't, use additive logic (legacy support)
    if (role && (!roles || !Array.isArray(roles))) {
      updateData.role = role;
      let currentRoles = user.roles || ['customer'];
      if (!Array.isArray(currentRoles)) {
        currentRoles = [user.role || 'customer'];
      }
      updateData.roles = [...new Set([...currentRoles, role])];
    }

    if (county !== undefined) updateData.county = county;
    if (town !== undefined) updateData.town = town;
    if (estate !== undefined) updateData.estate = estate;
    if (houseNumber !== undefined) updateData.houseNumber = houseNumber;
    
    // Handle Gender ENUM crash: Convert empty string to null
    if (gender !== undefined) {
      updateData.gender = (gender === '' || gender === null) ? null : gender;
    }

    if (campus !== undefined) updateData.campus = campus;
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;
    if (phoneVerified !== undefined) updateData.phoneVerified = phoneVerified;
    if (accessRestrictions !== undefined) updateData.accessRestrictions = accessRestrictions;
    if (isDeactivated !== undefined) updateData.isDeactivated = isDeactivated;
    
    // Handle Freeze status
    if (isFrozen !== undefined) {
      updateData.isFrozen = isFrozen;
      // When a user is frozen, they should also be deactivated
      if (isFrozen) updateData.isDeactivated = true;
    }
    
    if (isVerified !== undefined) updateData.isVerified = isVerified;
    if (banReason !== undefined) updateData.banReason = banReason;

    // If a super admin is assigning/changing a role via this endpoint,
    // automatically mark the user as fully verified.
    if (req.user && req.user.role === 'super_admin' && role && role !== user.role) {
      updateData.emailVerified = true;
      updateData.phoneVerified = true;
      updateData.isVerified = true;
    }

    await user.update(updateData);

    // Return updated user without password
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Email or phone already exists' });
    }
    res.status(500).json({ message: 'Server error while updating user.' });
  }
});

// PATCH /api/admin/users/:userId/verification - Update verification status
router.patch('/users/:userId/verification', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { emailVerified, phoneVerified, sendVerificationEmail, sendVerificationSms } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {};
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;
    if (phoneVerified !== undefined) updateData.phoneVerified = phoneVerified;

    await user.update(updateData);

    // Send verification email if requested
    if (sendVerificationEmail && !emailVerified) {
      try {
        const verificationToken = require('crypto').randomBytes(32).toString('hex');
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

        await sendEmail(
          user.email,
          'Email Verification Required',
          `Please verify your email by clicking this link: ${verificationUrl}`
        );

        await user.update({ emailVerificationToken: verificationToken });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
      }
    }

    // Send verification SMS if requested
    if (sendVerificationSms && !phoneVerified) {
      try {
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        await sendMessage(
          user.phone,
          `Your Comrades360 verification code is: ${verificationCode}`,
          'sms'
        );

        await user.update({ phoneVerificationCode: verificationCode });
      } catch (smsError) {
        console.error('Failed to send verification SMS:', smsError);
      }
    }

    res.json({
      message: 'Verification status updated successfully',
      user: {
        id: user.id,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (error) {
    console.error('Error updating verification status:', error);
    res.status(500).json({ message: 'Server error while updating verification status.' });
  }
});

// DELETE /api/admin/users/:userId - Delete a single user
router.delete('/users/:userId', auth, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Protection for super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot delete a super_admin account' });
    }

    await user.destroy();

    console.log(`Admin ${req.user.id} deleted user ${userId}`);

    res.json({
      success: true,
      message: 'User has been deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error while deleting user.', error: error.message });
  }
});

// POST /api/admin/users/bulk - Bulk operations on users
router.post('/users/bulk', auth, adminOnly, async (req, res) => {
  try {
    const { userIds, action } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    let updateData = {};
    let message = '';

    // Exclude super admins from bulk operations
    const users = await User.findAll({
      where: {
        id: { [Op.in]: userIds },
        role: { [Op.ne]: 'super_admin' }
      }
    });

    if (users.length === 0) {
      return res.status(400).json({ message: 'No valid users found for bulk operation (super_admins cannot be modified)' });
    }

    const userIdsToModify = users.map(u => u.id);

    switch (action) {
      case 'activate':
        await User.update({ isDeactivated: false }, {
          where: { id: { [Op.in]: userIdsToModify } }
        });
        message = `${users.length} user(s) activated successfully`;
        break;
      case 'deactivate':
        await User.update({ isDeactivated: true }, {
          where: { id: { [Op.in]: userIdsToModify } }
        });
        message = `${users.length} user(s) deactivated successfully`;
        break;
      case 'delete':
        await User.destroy({
          where: { id: { [Op.in]: userIdsToModify } }
        });
        message = `${users.length} user(s) deleted successfully`;
        break;
      default:
        return res.status(400).json({ message: 'Invalid action. Supported actions: activate, deactivate, delete' });
    }

    res.json({
      message,
      affectedUsers: users.length
    });
  } catch (error) {
    console.error('Error in bulk user operation:', error);
    res.status(500).json({ message: 'Server error during bulk operation.' });
  }
});

// GET /api/roles/applications - Get role applications
router.get('/roles/applications', auth, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const applications = await RoleApplication.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (page - 1) * limit
    });

    // Convert to plain objects and map document fields for frontend compatibility
    const formattedResults = applications.rows.map(app => {
      const appData = app.get({ plain: true });
      return {
        ...appData,
        // Map database fields to frontend fields
        nationalIdFront: appData.nationalIdFrontUrl,
        nationalIdBack: appData.nationalIdBackUrl,
        studentIdFront: appData.studentIdFrontUrl,
        studentIdBack: appData.studentIdBackUrl,
        // Keep the original URL fields as well
        nationalIdFrontUrl: appData.nationalIdFrontUrl,
        nationalIdBackUrl: appData.nationalIdBackUrl,
        studentIdFrontUrl: appData.studentIdFrontUrl,
        studentIdBackUrl: appData.studentIdBackUrl,
        user: app.user ? app.user.get({ plain: true }) : null
      };
    });

    res.json(formattedResults);
  } catch (error) {
    console.error('Error fetching role applications:', error);
    res.status(500).json({ error: 'Server error while fetching applications.' });
  }
});

// PUT /api/roles/applications/:id - Update application status
router.put('/roles/applications/:id', auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComments } = req.body;

    const application = await RoleApplication.findByPk(id, {
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update application status
    await application.update({
      status,
      adminComments,
      reviewedBy: req.user.id,
      reviewedAt: new Date()
    });

    // If approved, update user role
    if (status === 'approved') {
      const userToUpdate = await User.findByPk(application.userId);
      if (userToUpdate) {
        let currentRoles = userToUpdate.roles || ['customer'];
        if (!Array.isArray(currentRoles)) {
          currentRoles = [userToUpdate.role || 'customer'];
        }
        const updatedRoles = [...new Set([...currentRoles, application.appliedRole])];

        await userToUpdate.update({
          role: application.appliedRole,
          roles: updatedRoles,
          applicationStatus: 'approved',
          isVerified: true
        });
      }
    } else if (status === 'rejected') {
      await application.User.update({
        applicationStatus: 'rejected'
      });
    }

    res.json({
      message: `Application ${status} successfully`,
      application: {
        id: application.id,
        status: application.status,
        appliedRole: application.appliedRole,
        applicant: application.User.name
      }
    });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ error: 'Server error while updating application.' });
  }
});

// GET /api/admin/analytics/users - Get user analytics
router.get('/analytics/users', auth, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeUsers = await User.count({ where: { isDeactivated: false } });
    const deactivatedUsers = await User.count({ where: { isDeactivated: true } });

    // Count by role
    const roleCounts = {};
    const roles = ['customer', 'marketer', 'seller', 'delivery_agent', 'service_provider', 'admin'];

    for (const role of roles) {
      roleCounts[role] = await User.count({ where: { role } });
    }

    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await User.count({
      where: {
        createdAt: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });

    // Pending applications
    const pendingApplications = await RoleApplication.count({
      where: { status: 'pending' }
    });

    res.json({
      totalUsers,
      activeUsers,
      deactivatedUsers,
      recentRegistrations,
      pendingApplications,
      roleCounts
    });
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ message: 'Server error while fetching analytics.' });
  }
});

// Export users to CSV
router.get('/users/export', auth, adminOnly, async (req, res) => {
  try {
    // Get all users with necessary fields
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'isDeactivated', 'createdAt', 'lastLogin'],
      order: [['createdAt', 'DESC']]
    });

    // Prepare data for CSV
    const fields = [
      'id',
      'name',
      'email',
      'phone',
      'role',
      { label: 'status', value: row => row.isDeactivated ? 'Deactivated' : 'Active' },
      { label: 'registrationDate', value: row => row.createdAt },
      { label: 'lastLogin', value: row => row.lastLogin || 'Never' }
    ];

    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(users.map(user => user.get({ plain: true })));

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');

    // Send the CSV file
    res.send(csv);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ message: 'Error exporting users', error: error.message });
  }
});

// POST /api/admin/notifications/bulk - Send bulk notifications
router.post('/notifications/bulk', auth, adminOnly, async (req, res) => {
  try {
    const { userIds, title, message, type } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Validate notification type
    const validTypes = ['info', 'success', 'warning', 'alert'];
    const notificationType = validTypes.includes(type) ? type : 'info';

    // Get the Notification model
    const { Notification } = require('../models');

    // Create notifications for each user
    const notifications = userIds.map(userId => ({
      userId,
      title,
      message,
      type: notificationType,
      read: false
    }));

    await Notification.bulkCreate(notifications);

    console.log(`Bulk notifications sent to ${userIds.length} users by admin ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: `Notifications sent to ${userIds.length} user(s)`,
      count: userIds.length
    });
  } catch (error) {
    console.error('Error sending bulk notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending notifications',
      error: error.message
    });
  }
});

// POST /api/admin/test-notifications - Test email and SMS configuration
router.post('/test-notifications', auth, adminOnly, async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        message: 'Please provide at least email or phone number to test'
      });
    }

    const results = {
      email: null,
      sms: null
    };

    // Test email
    if (email) {
      try {
        const emailResult = await sendEmail(
          email,
          'Comrades360 - Test Email',
          'This is a test email from Comrades360. If you received this, your email configuration is working correctly!'
        );
        results.email = {
          success: true,
          method: emailResult.method,
          message: emailResult.method === 'smtp'
            ? `Email sent successfully via SMTP to ${email}`
            : `Email simulated (check server logs). Configure SMTP to send real emails.`
        };
      } catch (error) {
        results.email = {
          success: false,
          error: error.message
        };
      }
    }

    // Test SMS
    if (phone) {
      try {
        const smsResult = await sendSms(
          phone,
          'This is a test SMS from Comrades360. If you received this, your SMS configuration is working correctly!'
        );
        results.sms = {
          success: true,
          method: smsResult.method,
          message: smsResult.method === 'twilio'
            ? `SMS sent successfully via Twilio to ${phone}`
            : `SMS simulated (check server logs). Configure Twilio to send real SMS.`
        };
      } catch (error) {
        results.sms = {
          success: false,
          error: error.message
        };
      }
    }

    res.json({
      success: true,
      message: 'Notification test completed',
      results
    });
  } catch (error) {
    console.error('Error testing notifications:', error);
    res.status(500).json({
      message: 'Error testing notifications',
      error: error.message
    });
  }
});

module.exports = router;