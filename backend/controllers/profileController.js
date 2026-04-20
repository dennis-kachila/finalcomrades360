const { User, sequelize, LoginHistory } = require('../models');
const bcrypt = require('bcryptjs');
const { normalizeKenyanPhone } = require('../middleware/validators');

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findOne({
      where: { id: userId },
      attributes: [
        'id', 'name', 'email', 'phone', 'gender', 'dateOfBirth', 'bio',
        'profileVisibility', 'referralCode', 'role', 'updatedAt', 'createdAt'
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      username,
      email,
      phone,
      gender,
      dateOfBirth,
      bio,
      profileVisibility
    } = req.body;

    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user data with proper null handling
    const updateData = {};
    if (username !== undefined && username !== null) updateData.name = username;
    if (email !== undefined && email !== null) updateData.email = email;

    if (phone !== undefined && phone !== null) {
      const normalizedPhone = normalizeKenyanPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: 'Invalid Kenyan phone number format. Use 01... or 07... (10 digits) or +254... (13 digits)' });
      }
      
      // If phone is changing, reset verification status
      if (user.phone !== normalizedPhone) {
        updateData.phone = normalizedPhone;
        updateData.phoneVerified = false;
      }
    }

    if (gender !== undefined) updateData.gender = gender === 'undefined' ? null : gender;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth === 'undefined' ? null : dateOfBirth;
    if (bio !== undefined) updateData.bio = bio === 'undefined' ? null : bio;
    if (profileVisibility !== undefined) updateData.profileVisibility = profileVisibility === 'undefined' ? 'public' : profileVisibility;

    await user.update(updateData);

    // Recalculate verification status
    if (typeof user.recalculateIsVerified === 'function') {
      await user.recalculateIsVerified();
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        bio: user.bio,
        profileVisibility: user.profileVisibility,
        referralCode: user.referralCode,
        role: user.role,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await user.update({ password: hashedPassword });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get security data (login history, active sessions, etc.)
const getSecurityData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch real user data for security settings
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch recent login history
    const loginHistory = await LoginHistory.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    // Transform login history to match frontend expectation
    const formattedHistory = loginHistory.map(entry => ({
      timestamp: entry.createdAt,
      location: entry.location || 'Unknown',
      browser: entry.browser || 'Unknown',
      success: entry.status === 'success',
      device: entry.device || 'Unknown',
      os: entry.os
    }));

    // Construct response
    const securityData = {
      loginHistory: formattedHistory,
      activeSessions: [
        // For now, we simulate the current session as the only active one since we lack a Session table
        {
          device: formattedHistory[0]?.device || 'Desktop', // Fallback to most recent login device
          location: formattedHistory[0]?.location || 'Unknown',
          browser: formattedHistory[0]?.browser || 'Unknown',
          lastActive: new Date().toISOString() // Current time since they are calling this API
        }
      ],
      lastPasswordChange: user.updatedAt, // Using updatedAt as proxy for now
      socialLogins: {
        google: false, // Placeholder until SocialMediaAccount is fully integrated
        facebook: false
      },
      twoFactorEnabled: user.twoFactorEnabled
    };

    res.json(securityData);
  } catch (error) {
    console.error('Error getting security data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get login history
const getLoginHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const loginHistory = await LoginHistory.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 20
    });

    const formattedHistory = loginHistory.map(entry => ({
      timestamp: entry.createdAt,
      location: entry.location || 'Unknown',
      browser: entry.browser || 'Unknown',
      success: entry.status === 'success',
      device: entry.device || 'Unknown',
      os: entry.os || 'Unknown'
    }));

    res.json(formattedHistory);
  } catch (error) {
    console.error('Error getting login history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get active sessions
const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    // Mock active sessions for testing
    const activeSessions = [
      {
        device: 'desktop',
        location: 'Nairobi, Kenya',
        browser: 'Chrome',
        lastActive: new Date().toISOString()
      },
      {
        device: 'mobile',
        location: 'Nairobi, Kenya',
        browser: 'Safari',
        lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }
    ];

    res.json(activeSessions);
  } catch (error) {
    console.error('Error getting active sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Terminate a session
const terminateSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Mock session termination
    // In a real implementation, this would remove the session from database

    res.json({ message: 'Session terminated successfully', sessionId });
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update 2FA settings
const updateTwoFactorAuth = async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = req.body;

    // Mock 2FA update
    // In a real implementation, this would update the user's 2FA settings

    res.json({
      message: '2FA settings updated successfully',
      twoFactorEnabled: enabled
    });
  } catch (error) {
    console.error('Error updating 2FA:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update social login settings
const updateSocialLogin = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, connected } = req.body;

    // Mock social login update
    // In a real implementation, this would update the user's social login settings

    res.json({
      message: 'Social login settings updated successfully',
      provider,
      connected
    });
  } catch (error) {
    console.error('Error updating social login:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getSecurityData,
  getLoginHistory,
  getActiveSessions,
  terminateSession,
  updateTwoFactorAuth,
  updateSocialLogin
};