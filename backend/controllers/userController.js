const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { User, UserRole, Notification, Order } = require("../models");
const { isValidEmail, normalizeKenyanPhone } = require("../middleware/validators");
const { sendEmail } = require("../utils/mailer");
const { sendMessage } = require("../utils/messageService");
const { getDynamicMessage } = require("../utils/templateUtils");

const { uploadProfileImages } = require("../config/multer");
const { geocodeAddress } = require("../utils/geocodingUtils");
const genPublic = async () => { const y = new Date().getFullYear(); const seq = `${Math.floor(Math.random() * 1e6)}`.padStart(6, "0"); return `C360-${y}-${seq}`; };

// Admin: directly set a user's role (e.g., to 'delivery_agent')
const adminSetUserRole = async (req, res) => {
  const { userId, role } = req.body || {};
  try {
    const allowed = ['customer', 'seller', 'marketer', 'delivery_agent', 'admin'];
    if (!allowed.includes(role)) return res.status(400).json({ message: 'Invalid role value.' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.role = role;

    // Sync multi-role array
    let currentRoles = user.roles || ['customer'];
    if (!Array.isArray(currentRoles)) {
      currentRoles = [user.role || 'customer'];
    }

    // Ensure the new role is in the array
    if (!currentRoles.includes(role)) {
      currentRoles = [...currentRoles, role];
    }

    user.roles = currentRoles;
    await user.save();

    const payload = { id: user.id, name: user.name, email: user.email, role: user.role, roles: user.roles };
    return res.json({ message: 'User role updated.', user: payload });
  } catch (e) {
    return res.status(500).json({ message: 'Server error updating user role.', error: e.message });
  }
};

// Request email change: generate token and set pendingEmail
const requestEmailChange = async (req, res) => {
  const userId = req.user.id;
  const { newEmail } = req.body || {};
  try {
    if (!isValidEmail(newEmail)) return res.status(400).json({ message: 'Invalid email.' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.email === newEmail && user.emailVerified) return res.json({ message: 'This is already your current email.' });
    const existing = await User.findOne({ where: { email: newEmail, id: { [Op.ne]: userId } } });
    if (existing) return res.status(400).json({ message: 'Email already in use.' });
    // Generate 6-digit OTP
    const token = `${Math.floor(100000 + Math.random() * 900000)}`;
    user.pendingEmail = newEmail;
    user.emailChangeToken = token;
    user.emailChangeExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    // Send token to the NEW email address
    try { await sendEmail(newEmail, 'Confirm your new email', `Your verification code is: ${token}`); } catch { }
    try { await Notification.create({ userId, title: 'Confirm Email Change', message: 'A verification token was sent to your new email address.' }); } catch { }
    res.json({ message: 'Email change initiated. Check your new email for the verification token.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error requesting email change.', error: e.message });
  }
};

// Confirm email change using token
const confirmEmailChange = async (req, res) => {
    const { token } = req.body;
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || !user.emailChangeToken || !user.pendingEmail) {
            return res.status(400).json({ message: 'No email change request found' });
        }

        if (user.emailChangeToken !== token) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        if (new Date(user.emailChangeExpiresAt) < new Date()) {
            return res.status(400).json({ message: 'Token expired' });
        }

        user.email = user.pendingEmail;
        user.emailVerified = true;
        user.pendingEmail = null;
        user.emailChangeToken = null;
        user.emailChangeExpiresAt = null;
        await user.save();

        res.json({ message: 'Email updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error confirming email change', error: error.message });
    }
};

// Request phone change: generate OTP, store pendingPhone
// Request phone change: generate OTP, store pendingPhone
const requestPhoneOtp = async (req, res) => {
  const userId = req.user.id;
  const { newPhone, method } = req.body || {};
  try {
    if (!newPhone) return res.status(400).json({ message: 'New phone number is required.' });

    const norm = normalizeKenyanPhone(newPhone);
    if (!norm) return res.status(400).json({ message: 'Invalid phone format. Please use +254xxxxxxxxx.' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (user.phone === norm && user.phoneVerified) return res.json({ message: 'This is already your current phone number.' });

    const exists = await User.findOne({ where: { phone: norm, id: { [Op.ne]: userId } } });
    if (exists) {
      const email = exists.email || '';
      const maskedEmail = email.includes('@') 
        ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
        : 'another account';
      return res.status(400).json({ 
        message: `This phone number is already registered to ${maskedEmail}. Please log in with that account instead.` 
      });
    }

    const otp = `${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to the shared Otp table
    await Otp.destroy({ where: { phone: norm } });
    await Otp.create({ phone: norm, otp, expiresAt });

    // Send OTP to the NEW phone number
    try {
      const deliveryMethod = method === 'sms' ? 'sms' : 'whatsapp';
      const message = await getDynamicMessage('phoneVerification', 
        `Your Comrades360 verification OTP is {otp}. It expires in 10 minutes.`,
        { name: user.name || user.username || 'User', otp }
      );
      await sendMessage(norm, message, deliveryMethod);
    } catch (err) {
      console.error(`Error sending OTP via ${method || 'WhatsApp'}:`, err.message);
    }

    try { await Notification.create({ userId, title: 'Phone OTP', message: `An OTP was sent to your new phone number via ${method === 'sms' ? 'SMS' : 'WhatsApp'}.` }); } catch (err) { }

    res.json({ message: `OTP sent to your new phone via ${method === 'sms' ? 'SMS' : 'WhatsApp'}. Please confirm to update phone.` });
  } catch (e) {
    console.error('Critical Error in requestPhoneOtp:', e);
    res.status(500).json({ message: 'Server error requesting phone OTP.', error: e.message });
  }
};

// Confirm phone change with OTP
const confirmPhoneOtp = async (req, res) => {
  const userId = req.user.id;
  const { otp, phone } = req.body || {};
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const targetPhone = phone || user.pendingPhone;
    if (!targetPhone) return res.status(400).json({ message: 'Phone number context missing.' });

    const norm = normalizeKenyanPhone(targetPhone);

    const otpRecord = await Otp.findOne({
      where: { phone: norm, otp }
    });

    if (!otpRecord) return res.status(400).json({ message: 'Invalid verification code.' });
    if (new Date() > otpRecord.expiresAt) {
      await otpRecord.destroy();
      return res.status(400).json({ message: 'Verification code has expired.' });
    }

    user.phone = norm;
    user.phoneVerified = true;
    user.pendingPhone = null;
    await user.save();

    if (typeof user.recalculateIsVerified === 'function') {
      await user.recalculateIsVerified();
    }

    await otpRecord.destroy();

    res.json({ message: 'Phone updated successfully.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error confirming phone change.', error: e.message });
  }
};

// Change password with current password confirmation
const changePassword = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body || {};
  try {
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Both current and new passwords are required.' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error changing password.', error: e.message });
  }
};
const makeRef = () => `COMRADES360-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// Helper to strip placeholders so frontend forms show empty fields
const sanitizeUserPayload = (userData) => {
  const u = { ...userData };
  let originalEmail = u.email;
  let originalPhone = u.phone;

  if (u.email && u.email.startsWith('noemail_')) u.email = '';
  if (u.phone && u.phone.startsWith('nophone_')) u.phone = '';

  // Clear name if it matches the email prefix or is "UserXXXX"
  if (u.name) {
    if (/^User\d{0,4}$/.test(u.name)) {
      u.name = '';
    } else if (originalEmail && typeof originalEmail === 'string') {
      const prefix = originalEmail.split('@')[0];
      if (u.name === prefix) u.name = '';
    }
  }
  return u;
};

const me = async (req, res) => {
  const u = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password', 'emailChangeToken', 'phoneOtp'] }
  });
  if (!u) return res.status(404).json({ message: 'User not found' });
  const safeData = sanitizeUserPayload(u.get({ plain: true }));
  res.json(safeData);
};
const applyRole = async (req, res) => { const { name, email, phone, password, role, nationalIdNumber } = req.body; if (!['seller', 'marketer', 'delivery'].includes(role)) return res.status(400).json({ error: 'Invalid role' }); let userId = req.user?.id; let u = null; if (!userId) { if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' }); const norm = normalizeKenyanPhone(phone); if (!norm) return res.status(400).json({ error: 'Invalid phone' }); const hashed = await bcrypt.hash(password || Math.random().toString(36), 10); u = await User.create({ name, email, phone: norm, password: hashed, publicId: await genPublic(), referralCode: makeRef(), role: 'customer' }); userId = u.id; } const otp = `${Math.floor(100000 + Math.random() * 900000)}`; const r = await UserRole.create({ userId, role, nationalIdNumber, phoneOtp: otp, phoneOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) }); return res.json({ message: 'Role application received', otp, userRoleId: r.id }); };
const verifyRolePhone = async (req, res) => { const { userRoleId, otp } = req.body; const r = await UserRole.findByPk(userRoleId); if (!r || r.phoneOtp !== otp || r.phoneOtpExpiresAt < new Date()) return res.status(400).json({ error: 'Invalid/expired OTP' }); await r.update({ phoneOtp: null }); return res.json({ message: 'Phone verified' }); };
const adminApproveRole = async (req, res) => { const { userRoleId, approve } = req.body; const r = await UserRole.findByPk(userRoleId); if (!r) return res.status(404).json({ error: 'Not found' }); await r.update({ status: approve ? 'approved' : 'rejected' }); return res.json({ message: `Role ${approve ? 'approved' : 'rejected'}` }); };
const listPendingRoles = async (_req, res) => {
  const rows = await UserRole.findAll({
    where: { status: 'pending' },
    include: [{
      model: User,
      attributes: ['id', 'name', 'email', 'phone']
    }],
    order: [['createdAt', 'DESC']]
  });
  res.json(rows);
};

// Update current user's profile
const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const {
    name, phone, username, county, town, estate, houseNumber, additionalPhone, bio, gender, dateOfBirth, profileVisibility,
    businessName, businessAddress, businessCounty, businessTown, businessLandmark, businessPhone,
    businessLat, businessLng
  } = req.body || {};
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Handle file upload if present
    if (req.file) {
      const imageUrl = `/uploads/profiles/${req.file.filename}`;
      user.profileImage = imageUrl;
    }

    // Update basic profile fields
    if (name !== undefined && name !== null) user.name = String(name).trim();
    
    // Update phone
    if (phone !== undefined) {
      if (phone) {
        const normPhone = normalizeKenyanPhone(phone);
        if (!normPhone) return res.status(400).json({ message: 'Invalid phone number format.' });
        if (normPhone !== user.phone) {
          const existing = await User.findOne({ where: { phone: normPhone, id: { [Op.ne]: userId } } });
          if (existing) return res.status(400).json({ message: 'Phone number already in use.' });
          user.phone = normPhone;
          // user.phoneVerified = false; // Optional: Reset verification if it changes
        }
      } else {
        // user.phone = null; // SQLite NOT NULL might prevent this, but usually we want to keep it
      }
    }

    if (username !== undefined && username !== null) {
      const trimmedUsername = String(username).trim();
      if (trimmedUsername && trimmedUsername !== user.username) {
        // Check if username already exists
        const existing = await User.findOne({ where: { username: trimmedUsername, id: { [Op.ne]: userId } } });
        if (existing) return res.status(400).json({ message: 'Username already in use.' });
        user.username = trimmedUsername;
      }
    }

    // Update address fields
    if (county !== undefined) user.county = (county && String(county).trim()) || null;
    if (town !== undefined) user.town = (town && String(town).trim()) || null;
    if (estate !== undefined) user.estate = (estate && String(estate).trim()) || null;
    if (houseNumber !== undefined) user.houseNumber = (houseNumber && String(houseNumber).trim()) || null;
    if (houseNumber !== undefined) user.houseNumber = (houseNumber && String(houseNumber).trim()) || null;
    if (additionalPhone !== undefined) {
      if (additionalPhone) {
        const normAdditional = normalizeKenyanPhone(additionalPhone);
        if (!normAdditional) return res.status(400).json({ message: 'Invalid format for additional phone.' });
        user.additionalPhone = normAdditional;
      } else {
        user.additionalPhone = null;
      }
    }

    // Update personal fields
    if (bio !== undefined) user.bio = (bio && String(bio).trim()) || null;
    if (gender !== undefined) user.gender = gender || null;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;
    if (profileVisibility !== undefined) user.profileVisibility = profileVisibility || 'public';

    // Update business fields
    let businessLocationChanged = false;
    if (businessName !== undefined) user.businessName = (businessName && String(businessName).trim()) || null;
    if (businessAddress !== undefined) {
      const newAddress = (businessAddress && String(businessAddress).trim()) || null;
      if (user.businessAddress !== newAddress) {
        user.businessAddress = newAddress;
        businessLocationChanged = true;
      }
    }
    if (businessCounty !== undefined) {
      const newCounty = (businessCounty && String(businessCounty).trim()) || null;
      if (user.businessCounty !== newCounty) {
        user.businessCounty = newCounty;
        businessLocationChanged = true;
      }
    }
    if (businessTown !== undefined) {
      const newTown = (businessTown && String(businessTown).trim()) || null;
      if (user.businessTown !== newTown) {
        user.businessTown = newTown;
        businessLocationChanged = true;
      }
    }
    if (businessLandmark !== undefined) user.businessLandmark = (businessLandmark && String(businessLandmark).trim()) || null;
    if (businessPhone !== undefined) {
      if (businessPhone) {
        const normBusPhone = normalizeKenyanPhone(businessPhone);
        if (normBusPhone) user.businessPhone = normBusPhone;
        else user.businessPhone = String(businessPhone).trim(); // Fallback if normalization fails but we want to save it
      } else {
        user.businessPhone = null;
      }
    }

    if (businessLat !== undefined) user.businessLat = businessLat;
    if (businessLng !== undefined) user.businessLng = businessLng;

    // AUTOMATIC GPS RESOLUTION: If business location changed AND manual coordinates weren't provided, geocode it!
    if (businessLocationChanged && (businessLat === undefined || businessLat === null)) {
      try {
        console.log(`[Smart Geocoder] Address changed for user ${user.id}, resolving GPS...`);
        const coords = await geocodeAddress(user.businessAddress, user.businessTown, user.businessCounty);
        if (coords) {
          user.businessLat = coords.lat;
          user.businessLng = coords.lng;
          console.log(`[Smart Geocoder] Successfully updated GPS for ${user.name}: [${coords.lat}, ${coords.lng}]`);
        }
      } catch (geoErr) {
        console.warn('[Smart Geocoder] Background geocoding failed:', geoErr.message);
      }
    }

    // Allow updating nationalIdUrl (typically from upload)
    const { nationalIdUrl: nationalIdUrlBody } = req.body || {};
    if (nationalIdUrlBody !== undefined) {
      user.nationalIdUrl = nationalIdUrlBody;
      // If URL is present, status is pending. If cleared, status is none.
      user.nationalIdStatus = nationalIdUrlBody ? 'pending' : 'none';

      // If cleared, also clear rejection reason
      if (!nationalIdUrlBody) {
        user.nationalIdRejectionReason = null;
      }
    }

    await user.save();

    // Check if ID was just submitted (status is pending) and notify super admins
    if (user.nationalIdStatus === 'pending' && user.nationalIdUrl) {
      try {
        const superAdmins = await User.findAll({
          where: { role: { [Op.or]: ['superadmin', 'super_admin'] } },
          attributes: ['id']
        });

        if (superAdmins.length > 0) {
          const notifications = superAdmins.map(admin => ({
            userId: admin.id,
            title: 'ID Verification Request',
            message: `User ${user.name} (${user.email}) has submitted their National ID for verification.`,
            type: 'info'
          }));
          await Notification.bulkCreate(notifications);
        }
      } catch (err) {
        console.error('Failed to notify super admins about ID submission:', err);
      }
    }

    const payload = user.toJSON();
    delete payload.password;
    delete payload.emailChangeToken;
    delete payload.phoneOtp;
    res.json({
      message: 'Profile updated.',
      user: {
        ...payload,
        profileImage: `${process.env.BASE_URL || 'http://localhost:5000'}${user.profileImage || ''}`
      }
    });
  } catch (e) {
    console.error('Error updating profile:', e);
    res.status(500).json({ message: 'Server error updating profile.', error: e.message });
  }
};

// User requests account deletion (admin must approve)
const requestAccountDeletion = async (req, res) => {
  const userId = req.user.id;
  const { reason } = req.body || {};
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.isDeactivated) return res.status(400).json({ message: 'Account already deactivated.' });
    if (user.deletionRequested) return res.status(400).json({ message: 'Deletion already requested.' });
    user.deletionRequested = true;
    await user.save();

    // Notify user
    try { await Notification.create({ userId, title: 'Deletion Request Received', message: 'Your account deletion request is pending admin review.' }); } catch { }

    // Optionally notify admin(s) - if you have an admin user id listing, here we skip and rely on admin UI to list
    res.status(200).json({ message: 'Deletion request submitted. Admin will review shortly.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error processing deletion request', error: error.message });
  }
};

// Generate a unique referral code
const generateReferralCode = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
  let code;
  let isUnique = false;

  // Keep generating until we find a unique code
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Check if code already exists
    const existingUser = await User.findOne({ where: { referralCode: code } });
    if (!existingUser) {
      isUnique = true;
    }
  }

  return code;
};

// Get full user profile including referral code
const getFullProfile = async (req, res) => {
  try {
    let user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry', 'emailVerificationToken'] },
      include: [
        {
          model: UserRole,
          as: 'userRoles',
          attributes: ['role', 'createdAt'],
          required: false
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate a referral code if the user doesn't have one
    if (!user.referralCode) {
      user.referralCode = await generateReferralCode();
      await user.save();
    }

    // Include the referral code in the response
    const userData = user.get({ plain: true });

    // Add order count
    userData.totalOrders = await Order.count({ where: { userId: user.id } });

    res.json(sanitizeUserPayload(userData));
  } catch (error) {
    console.error('Error fetching full user profile:', error);
    res.status(500).json({ message: 'Error fetching user profile', error: error.message });
  }
};

const listUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const users = await User.findAll({
      where: { role },
      attributes: ['id', 'name', 'email', 'phone', 'role']
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error listing users by role.', error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'roles', 'profileImage', 'businessAddress', 'businessCounty', 'businessTown']
    });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching user.', error: error.message });
  }
};

// Set/Update dashboard password (requires current main password)
const setDashboardPassword = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, dashboardPassword } = req.body || {};
  try {
    if (!currentPassword || !dashboardPassword) return res.status(400).json({ message: 'Current password and new dashboard password are required.' });
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Verify main password first
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });

    // Hash and save dashboard password
    const hashed = await bcrypt.hash(dashboardPassword, 10);
    user.dashboardPassword = hashed;
    await user.save();

    res.json({ message: 'Dashboard password set successfully.' });
  } catch (e) {
    res.status(500).json({ message: 'Server error setting dashboard password.', error: e.message });
  }
};

// Verify dashboard password for session access
const verifyDashboardPassword = async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body || {};
  try {
    if (!password) return res.status(400).json({ message: 'Password is required.' });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (!user.dashboardPassword) {
      return res.status(400).json({ message: 'Dashboard password not set. Please set it in your profile settings.' });
    }

    const ok = await bcrypt.compare(password, user.dashboardPassword);
    if (!ok) return res.status(401).json({ message: 'Incorrect dashboard password.' });

    res.json({ message: 'Dashboard password verified successfully.', success: true });
  } catch (e) {
    res.status(500).json({ message: 'Server error verifying dashboard password.', error: e.message });
  }
};

module.exports = {
  adminSetUserRole,
  requestEmailChange,
  confirmEmailChange,
  requestPhoneOtp,
  confirmPhoneOtp,
  changePassword,
  me,
  applyRole,
  verifyRolePhone,
  adminApproveRole,
  listPendingRoles,
  updateProfile,
  updateAddress: updateProfile, // Alias for address updates from checkout
  requestAccountDeletion,
  getFullProfile,
  listUsersByRole,
  getUserById,
  setDashboardPassword,
  verifyDashboardPassword
};
