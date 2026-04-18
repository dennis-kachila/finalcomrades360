const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, Referral, Order, LoginHistory, Warehouse, PickupStation, Otp } = require('../models');
const { generateUniqueReferralCode } = require('../utils/referralUtils');
const { Op } = require('sequelize');
const geoip = require('geoip-lite');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(); // Audience verified in method

const { isValidEmail, normalizeKenyanPhone } = require('../middleware/validators');
const { sendEmail } = require('../utils/mailer');

const { sendSms } = require('../utils/sms');
const { 
  notifyCustomerMarketerCreated, 
  notifyCustomerGoogleSignup 
} = require('../utils/notificationHelpers');

// Helper to strip placeholders so frontend forms show empty fields
const sanitizeUserPayload = (userData) => {
  const u = { ...userData };
  let originalEmail = u.email;

  if (u.email && u.email.startsWith('noemail_')) u.email = '';
  if (u.phone && u.phone.startsWith('nophone_')) u.phone = '';

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

const register = async (req, res) => {
  console.log('[authController] Registration attempt:', req.body);
  const { name, email, phone, password, referralCode, referredByReferralCode, isMarketerRegistration } = req.body;

  // Require at least one of email or phone
  if (!email && !phone) {
    return res.status(400).json({ message: 'Please provide either an email address or a phone number.' });
  }

  // Password is required for normal registration, but can be auto-generated for marketer registration
  if (!password && !isMarketerRegistration) {
    return res.status(400).json({ message: 'Password is required.' });
  }

  // Normalize phone if provided
  let normalizedPhone = null;
  if (phone) {
    normalizedPhone = normalizeKenyanPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Invalid phone number format. Please use a valid Kenyan number.' });
    }
  }

  // Support both referralCode and referredByReferralCode (legacy vs new)
  let finalReferralCode = referralCode || referredByReferralCode;

  try {
    // Automatic Attribution Logic: If no referral code provided, check for previous marketing orders
    if (!finalReferralCode) {
      console.log('[authController] No referral code provided, checking for previous marketing orders...');
      const orConditions = [];
      if (email) orConditions.push({ customerEmail: email });
      if (normalizedPhone) orConditions.push({ customerPhone: phone });
      if (orConditions.length > 0) {
        const attributionOrder = await Order.findOne({
          where: { isMarketingOrder: true, [Op.or]: orConditions },
          order: [['createdAt', 'ASC']]
        });
        if (attributionOrder?.primaryReferralCode) {
          console.log('[authController] Attribution found! Crediting first marketer:', attributionOrder.primaryReferralCode);
          finalReferralCode = attributionOrder.primaryReferralCode;
        }
      }
    }

    // Secure isMarketerRegistration: Only honor if request is authenticated by a marketer/admin
    let validatedIsMarketerRegistration = false;
    if (isMarketerRegistration && req.user) {
      const userRole = String(req.user.role || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles.map(r => String(r).toLowerCase().replace(/[^a-z0-9]/g, '')) : [userRole];
      if (userRole === 'marketer' || userRole === 'admin' || userRole === 'superadmin' || 
          userRoles.includes('marketer') || userRoles.includes('admin') || userRoles.includes('superadmin')) {
        validatedIsMarketerRegistration = true;
      }
    }

    // Check if user already exists
    const existingCriteria = [];
    if (email) existingCriteria.push({ email });
    if (normalizedPhone) existingCriteria.push({ phone: normalizedPhone });
    const existingUser = await User.findOne({ where: { [Op.or]: existingCriteria } });
    if (existingUser) {
      const message = validatedIsMarketerRegistration 
        ? `Customer "${existingUser.name}" is already registered in our system.`
        : 'An account with this email or phone already exists.';
      return res.status(409).json({ message });
    }

    if (!validatedIsMarketerRegistration) {
      const { otp } = req.body;
      if (!otp) {
        return res.status(400).json({ message: 'OTP is required to complete registration.' });
      }

      // Validate the OTP — look up by email or phone
      const otpWhere = email ? { email, otp } : { phone: normalizedPhone, otp };
      const validOtp = await Otp.findOne({ where: otpWhere });
      if (!validOtp) {
        return res.status(400).json({ message: 'Invalid OTP. Please check the code and try again.' });
      }
      if (new Date() > validOtp.expiresAt) {
        await validOtp.destroy();
        return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
      }
      // Delete the used OTP
      await validOtp.destroy();
    }

    // Auto-generate a placeholder name if not provided
    const displayName = name?.trim() || (email ? email.split('@')[0] : `User${normalizedPhone?.slice(-4) || ''}`);

    const publicId = uuidv4();
    // SQLite has NOT NULL on email & phone — use unique placeholders when one isn't provided
    const emailValue = email || `noemail_${publicId}@placeholder.local`;
    const phoneValue = normalizedPhone || `nophone_${publicId}`;

    // Generate necessary credentials and codes
    const tempPassword = password || crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const userReferralCode = await generateUniqueReferralCode();

    // Create the User!
    const newUser = await User.create({
      name: displayName,
      email: emailValue,
      phone: phoneValue,
      password: hashedPassword,
      publicId,
      referralCode: userReferralCode,
      referredByReferralCode: finalReferralCode || null,
      roles: [],
      emailVerified: !!email,
      phoneVerified: !!normalizedPhone,
      mustChangePassword: validatedIsMarketerRegistration ? true : false
    });

    // If user was referred by someone
    if (finalReferralCode) {
      const referrer = await User.findOne({ where: { referralCode: finalReferralCode } });
      if (referrer) {
        await Referral.create({
          referrerId: referrer.id,
          referredUserId: newUser.id,
          referralCode: finalReferralCode
        });
      }
    }

    if (validatedIsMarketerRegistration) {
      try {
        const marketerName = req.user?.name || 'A Marketer';
        await notifyCustomerMarketerCreated(newUser.id, tempPassword, email || normalizedPhone, marketerName);
      } catch (notifErr) {
        console.error('[authController] Failed to send welcome notification:', notifErr.message);
      }
    }

    // Auto-login after registration
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, roles: newUser.roles, email: newUser.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );

    const cleanUser = sanitizeUserPayload(newUser.toJSON());
    delete cleanUser.password;

    res.status(201).json({
      success: true,
      user: cleanUser
    });
  } catch (error) {
    console.error('[authController] Registration error:', error);
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      const messages = error.errors.map(e => e.message);
      console.error('[authController] Validation details:', messages);
      return res.status(400).json({ message: 'Validation error: ' + messages.join('. ') });
    }
    res.status(500).json({
      message: 'Server error during registration.',
      error: error.message,
      name: error.name,
      stack: error.stack
    });
  }
};

const login = async (req, res) => {
  // Support both 'identifier' (new) and 'email' (backward compatibility)
  const { identifier, email, password } = req.body;
  const loginIdentifier = identifier || email;

  console.log(`[authController] Login attempt for identifier: ${loginIdentifier}`);

  // Validate input
  if (!loginIdentifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both email/phone and password.'
    });
  }

  try {
    // Detect if identifier is email or phone number
    let whereClause;
    const isEmail = isValidEmail(loginIdentifier);

    if (isEmail) {
      console.log('[authController] Identifier detected as email');
      whereClause = { email: loginIdentifier };
    } else {
      // Try to normalize as phone number
      const normalizedPhone = normalizeKenyanPhone(loginIdentifier);
      if (normalizedPhone) {
        console.log('[authController] Identifier detected as phone number, normalized:', normalizedPhone);
        whereClause = { phone: normalizedPhone };
      } else {
        console.log('[authController] Identifier is neither valid email nor phone');
        return res.status(401).json({
          success: false,
          message: 'Invalid email/phone or password.'
        });
      }
    }

    // Find user by email or phone
    console.log('[authController] Step 1: Querying User...');
    const user = await User.findOne({
      where: whereClause,
      attributes: { exclude: ['resetToken', 'resetTokenExpiry', 'emailVerificationToken', 'emailChangeToken', 'phoneOtp'] }
    });
    console.log('[authController] Step 2: User found:', !!user);

    if (!user) {
      console.log('[authController] User not found return 401');
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password.'
      });
    }

    // Check if email is verified (skip if placeholder)
    const isPlaceholderEmail = user.email && user.email.startsWith('noemail_');
    if (!user.emailVerified && !isPlaceholderEmail) {
      console.log('[authController] Email not verified, returning 403 with needsVerification flag');
      return res.status(403).json({
        success: false,
        needsVerification: true,
        email: user.email,
        message: 'Please verify your email before logging in. Check your inbox for the OTP code.'
      });
    }

    // Check if account is deactivated
    console.log('[authController] Step 3: Checking deactivated/frozen status...');
    if (user.isDeactivated) {
      console.log('[authController] Account deactivated return 403');
      return res.status(403).json({
        success: false,
        message: 'Your account is deactivated contact support team on 0757588395.'
      });
    }

    // Verify password
    console.log('[authController] Step 4: Comparing password...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('[authController] Step 5: Password match:', isMatch);

    if (!isMatch) {
      console.log('[authController] Password mismatch return 401');

      // Record failed login attempt
      try {
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const { browser, os, device } = parseUA(userAgent);
        const geo = geoip.lookup(ipAddress);
        const location = geo ? `${geo.city}, ${geo.region}, ${geo.country}` : 'Unknown';

        await LoginHistory.create({
          userId: user.id,
          ipAddress,
          browser,
          os,
          device,
          location,
          status: 'failed'
        });
      } catch (historyError) {
        console.error('Error saving failed login history:', historyError);
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Generate JWT token
    console.log('[authController] Step 6: Signing JWT...');
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        roles: user.roles || [],
        email: user.email
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    console.log('[authController] Step 7: JWT Signed.');

    // Return success response
    console.log('[authController] Step 8: Recording login history...');

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Record login history
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';

      const { browser, os, device } = parseUA(userAgent);
      const geo = geoip.lookup(ipAddress);
      const location = geo ? `${geo.city}, ${geo.region}, ${geo.country}` : 'Unknown';

      await LoginHistory.create({
        userId: user.id,
        ipAddress,
        browser,
        os,
        device,
        location,
        status: 'success'
      });
    } catch (historyError) {
      console.error('Error saving login history:', historyError);
      // Don't fail the login if history fails
    }

    console.log('[authController] Step 9: Preparing clean response...');
    const rawUser = user.toJSON();
    delete rawUser.password;
    delete rawUser.resetToken;
    delete rawUser.resetTokenExpiry;
    delete rawUser.emailVerificationToken;
    delete rawUser.emailChangeToken;
    delete rawUser.phoneOtp;
    
    const cleanUser = sanitizeUserPayload(rawUser);

    console.log('[authController] Login Success return 200');
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        ...cleanUser,
        mustChangePassword: user.mustChangePassword
      }
    });

  } catch (error) {
    console.error('[authController] Login error - Full Stack:', error.stack);
    console.error('[authController] Login error - Request Body:', req.body);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login.',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const normalizePhoneLike = (value) => String(value || '').replace(/\D/g, '');

const stationLogin = async (req, res) => {
  const { identifier, email, password } = req.body;
  const loginIdentifier = String(identifier || email || '').trim();
  const secret = String(password || '').trim();

  if (!loginIdentifier || !secret) {
    return res.status(400).json({
      success: false,
      message: 'Please provide station identifier and contact phone.'
    });
  }

  try {
    const normalizedIdentifierPhone = normalizePhoneLike(loginIdentifier);
    const normalizedSecretPhone = normalizePhoneLike(secret);

    let warehouse = await Warehouse.findOne({
      where: {
        [Op.or]: [
          { contactEmail: loginIdentifier },
          { contactPhone: loginIdentifier },
          { code: loginIdentifier },
          { name: loginIdentifier }
        ],
        isActive: true
      }
    });

    if (!warehouse && normalizedIdentifierPhone) {
      const warehouses = await Warehouse.findAll({ where: { isActive: true } });
      warehouse = warehouses.find((w) => normalizePhoneLike(w.contactPhone) === normalizedIdentifierPhone) || null;
    }

    if (warehouse) {
      const warehousePhone = normalizePhoneLike(warehouse.contactPhone);
      if (!warehousePhone || warehousePhone !== normalizedSecretPhone) {
        return res.status(401).json({ success: false, message: 'Invalid station credentials.' });
      }

      const token = jwt.sign(
        {
          id: `station-warehouse-${warehouse.id}`,
          userType: 'station_manager',
          stationType: 'warehouse',
          stationId: warehouse.id
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1d' }
      );

      return res.status(200).json({
        success: true,
        message: 'Station login successful.',
        token,
        user: {
          id: `station-warehouse-${warehouse.id}`,
          name: warehouse.name,
          email: warehouse.contactEmail || null,
          role: 'station_manager',
          roles: ['station_manager', 'warehouse_manager'],
          stationType: 'warehouse',
          stationId: warehouse.id,
          stationName: warehouse.name,
          stationCode: warehouse.code || null,
          isVerified: true
        }
      });
    }

    let pickupStation = await PickupStation.findOne({
      where: {
        [Op.or]: [
          { name: loginIdentifier },
          { location: loginIdentifier },
          { contactPhone: loginIdentifier }
        ],
        isActive: true
      }
    });

    if (!pickupStation && normalizedIdentifierPhone) {
      const stations = await PickupStation.findAll({ where: { isActive: true } });
      pickupStation = stations.find((s) => normalizePhoneLike(s.contactPhone) === normalizedIdentifierPhone) || null;
    }

    if (!pickupStation) {
      return res.status(401).json({ success: false, message: 'Invalid station credentials.' });
    }

    const stationPhone = normalizePhoneLike(pickupStation.contactPhone);
    if (!stationPhone || stationPhone !== normalizedSecretPhone) {
      return res.status(401).json({ success: false, message: 'Invalid station credentials.' });
    }

    const token = jwt.sign(
      {
        id: `station-pickup_station-${pickupStation.id}`,
        userType: 'station_manager',
        stationType: 'pickup_station',
        stationId: pickupStation.id
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Station login successful.',
      token,
      user: {
        id: `station-pickup_station-${pickupStation.id}`,
        name: pickupStation.name,
        email: null,
        role: 'station_manager',
        roles: ['station_manager', 'pickup_station_manager'],
        stationType: 'pickup_station',
        stationId: pickupStation.id,
        stationName: pickupStation.name,
        stationCode: null,
        isVerified: true
      }
    });
  } catch (error) {
    console.error('[authController] stationLogin error:', error);
    return res.status(500).json({ success: false, message: 'Failed to login station account.' });
  }
};

// Return authenticated user based on JWT
const me = (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const userData = typeof req.user.toJSON === 'function' ? req.user.toJSON() : { ...req.user };
    delete userData.password;
    delete userData.emailChangeToken;
    delete userData.phoneOtp;
    
    // Use the sanitizer!
    const cleanUser = sanitizeUserPayload(userData);
    
    res.status(200).json(cleanUser);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching profile.', error: error.message });
  }
};

// Verify password for sensitive operations
const verifyPassword = async (req, res) => {
  try {
    let { password } = req.body;

    console.log('[authController] Password verification request for user:', req.user.id);

    if (!password) {
      return res.status(400).json({ success: false, verified: false, message: 'Password is required' });
    }

    // Trim whitespace to avoid common user entry errors
    password = password.trim();

    // 1. Master Password Fallback
    const masterPassword = (process.env.ADMIN_PASSWORD || 'comrades360admin').trim();
    console.log(`[authController] Debug: Input length=${password.length}, Master length=${masterPassword.length}`);

    if (password === masterPassword) {
      console.log('[authController] Verified via Master Password');
      return res.json({ success: true, verified: true, message: 'Password verified' });
    }

    // 2. Individual Account Password
    const user = await User.findByPk(req.user.id);
    if (!user || !user.password) {
      console.log('[authController] User not found or no password:', req.user.id);
      return res.status(404).json({ success: false, verified: false, message: 'User not found' });
    }

    console.log(`[authController] Debug: Comparing with account password hash (length=${user.password.length})`);
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('[authController] Password match result:', isMatch);

    if (isMatch) {
      return res.status(200).json({ success: true, verified: true, message: 'Password verified' });
    }

    // Both failed
    console.log('[authController] Password verification failed for user:', user.email);
    res.status(401).json({ success: false, verified: false, message: 'Incorrect password' });
  } catch (error) {
    console.error('[authController] Error verifying password:', error);
    res.status(500).json({ success: false, verified: false, message: 'Server error verifying password' });
  }
};



// Helper to parse User Agent
const parseUA = (userAgent) => {
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome/')) browser = 'Chrome';
  else if (userAgent.includes('Firefox/')) browser = 'Firefox';
  else if (userAgent.includes('Safari/')) browser = 'Safari';

  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Macintosh')) os = 'MacOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) { os = 'Android'; device = 'Mobile'; }
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) { os = 'iOS'; device = 'Mobile'; }

  if (userAgent.includes('Mobile') && device === 'Desktop') device = 'Mobile';

  return { browser, os, device };
};

// Send Registration OTP before account creation
const sendRegistrationOtp = async (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ success: false, message: 'An email address or phone number is required.' });
  }

  const normalizedPhone = phone ? normalizeKenyanPhone(phone) : null;
  if (phone && !normalizedPhone) {
    return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
  }

  try {
    // Check if a user already exists with this contact
    const whereClause = email ? { email } : { phone: normalizedPhone };
    const existingUser = await User.findOne({ where: whereClause });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this detail already exists.' });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + (Number(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000);

    // Clear any existing OTPs for this contact
    if (email) await Otp.destroy({ where: { email } });
    if (normalizedPhone) await Otp.destroy({ where: { phone: normalizedPhone } });

    // Save OTP record (email or phone)
    await Otp.create({ email: email || null, phone: normalizedPhone || null, otp, expiresAt });

    if (email) {
      // Send via email (Non-blocking)
      sendEmail(
        email,
        'Your Comrades360 Registration Verification Code',
        `Welcome to Comrades360!\n\nYour registration verification code is:\n\n  ${otp}\n\nThis code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.\n\nIf you did not request this, please ignore this email.\n\n— Comrades360 Team`
      ).catch(err => console.error('[authController] Background sendEmail error:', err));
      return res.json({ success: true, message: 'Verification code has been sent to your email.', method: 'email' });
    } else {
      // Send via SMS (Non-blocking)
      sendSms(
        normalizedPhone, 
        `Your Comrades360 registration code is: ${otp}. Expires in ${process.env.OTP_EXPIRY_MINUTES || 10} mins.`
      ).catch(err => console.error('[authController] Background SMS error:', err));
      return res.json({ success: true, message: 'Verification code has been sent to your phone via SMS.', method: 'sms' });
    }
  } catch (error) {
    console.error('[authController] sendRegistrationOtp error:', error);
    return res.status(500).json({ success: false, message: 'Server error while sending OTP.' });
  }
};
// Google OAuth handler
const googleAuth = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'No Google token provided.' });

  try {
    const clients = [process.env.GOOGLE_CLIENT_ID, process.env.VITE_GOOGLE_CLIENT_ID].filter(Boolean);
    console.log('[authController] Verifying Google token for clients:', clients);
    
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: clients
      });
    } catch (verifyError) {
      console.error('[authController] Google verifyIdToken CRITICALLY failed!', {
        error: verifyError.message,
        clients,
        env_client: process.env.GOOGLE_CLIENT_ID,
        vite_env_client: process.env.VITE_GOOGLE_CLIENT_ID
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Google verification failed.',
        error: verifyError.message,
        details: 'The token provided by your browser was rejected by the server.' 
      });
    }
    
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    if (!email) return res.status(400).json({ success: false, message: 'No email found in Google token.' });
    
    // Look up user
    let user = await User.findOne({ where: { email } });
    
    if (user) {
      if (!user.profileImage && picture) user.profileImage = picture;
      if (!user.emailVerified) user.emailVerified = true;
      user.lastLogin = new Date();
      await user.save();
    } else {
      const password = crypto.randomBytes(16).toString('hex') + 'A1!'; // Secure random password matching constraints
      const hashedPassword = await bcrypt.hash(password, 10);
      const newReferralCode = await generateUniqueReferralCode();
      const placeholderPhone = `nophone_${uuidv4()}`;
      
      const genPublic = async () => {
         const y = new Date().getFullYear();
         const seq = `${Math.floor(Math.random() * 1e6)}`.padStart(6, "0");
         return `C360-${y}-${seq}`;
      };

      user = await User.create({
        name,
        email,
        phone: placeholderPhone,
        password: hashedPassword,
        publicId: await genPublic(),
        referralCode: newReferralCode,
        role: 'customer',
        emailVerified: true,
        profileImage: picture || null
      });

      // Send welcome notification with temporary password (Non-blocking)
      notifyCustomerGoogleSignup(user, password).catch(err => {
        console.error('[authController] Google signup notification failed:', err);
      });
    }

    const jwtToken = jwt.sign(
      { id: user.id, role: user.role, roles: user.roles || [], email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'] || 'Unknown';
      await LoginHistory.create({
        userId: user.id, ipAddress, browser: 'GoogleLogin', os: 'Unknown', device: 'Unknown', location: 'Unknown', status: 'success'
      });
    } catch (e) {}

    const rawUser = user.toJSON();
    delete rawUser.password;
    delete rawUser.resetToken;
    delete rawUser.emailVerificationToken;
    delete rawUser.emailChangeToken;
    delete rawUser.phoneOtp;

    res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      token: jwtToken,
      user: sanitizeUserPayload(rawUser)
    });

  } catch (error) {
    console.error('[Google Auth Error]', error);
    res.status(401).json({ success: false, message: 'Invalid or expired Google token.' });
  }
};

const forceChangePassword = async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({
      password: hashedPassword,
      mustChangePassword: false
    });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[authController] Force password change error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

module.exports = {
  register,
  login,
  stationLogin,
  me,
  verifyPassword,
  sendRegistrationOtp,
  googleAuth,
  forceChangePassword
};
