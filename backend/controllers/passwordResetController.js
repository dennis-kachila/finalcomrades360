const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, PasswordReset, PlatformConfig } = require('../models');
const { sendEmail } = require('../utils/mailer');
const { sendMessage } = require('../utils/messageService');
const { isValidEmail, normalizeKenyanPhone } = require('../middleware/validators');
const { getDynamicMessage, getEnabledChannels } = require('../utils/templateUtils');
const { mirrorOtpToSocket } = require('../utils/otpUtils');

const DEFAULT_RESET_TEMPLATE = 'Your Comrades360 password reset code is {otp}. It expires in {minutes} minutes.';
const DEFAULT_RESET_CHANNELS = { email: true, sms: true, whatsapp: false };

// Refactored to use templateUtils

const sendToPhoneCandidates = async (numbers, message, method, userId) => {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    console.warn(`[password-reset] No valid phone found for ${method.toUpperCase()} delivery for user ${userId}`);
    return;
  }

  let sent = false;
  for (const phoneNumber of numbers) {
    try {
      await sendMessage(phoneNumber, message, method);
      sent = true;
      break;
    } catch (deliveryError) {
      console.warn(`[password-reset] ${method.toUpperCase()} delivery failed to ${phoneNumber}:`, deliveryError.message);
    }
  }

  if (!sent) {
    console.warn(`[password-reset] ${method.toUpperCase()} delivery failed for all candidate numbers for user ${userId}`);
  }
};

const requestPasswordReset = async (req, res) => {
  const { email, phone, identifier, socketId } = req.body || {}
  try {
    const rawIdentifier = String(identifier || email || phone || '').trim();
    if (!rawIdentifier) {
      return res.status(400).json({ message: 'Email or phone is required.' })
    }

    const looksLikeEmail = isValidEmail(rawIdentifier);
    const normalizedPhone = looksLikeEmail ? null : normalizeKenyanPhone(rawIdentifier);

    const lookupWhere = looksLikeEmail
      ? { email: rawIdentifier }
      : (normalizedPhone ? { phone: normalizedPhone } : { email: rawIdentifier });

    const user = await User.findOne({ where: lookupWhere })
    // To prevent user enumeration, always respond with success, but only create token if user exists
    // Generate 6-digit numeric code
    const token = Math.floor(100000 + Math.random() * 900000).toString()
    const expiryMinutes = 60;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000)
      if (user) {
        await PasswordReset.update({ used: true }, { where: { userId: user.id, used: false } })
        await PasswordReset.create({ userId: user.id, token, expiresAt, used: false })

        const channels = await getEnabledChannels('passwordReset');
        const resetMessage = await getDynamicMessage(
          'passwordReset',
          `Your Comrades360 password reset code is: ${token}. It expires in ${expiryMinutes} minutes.\n\n@comrades360.shop #${token}`,
          { otp: token, minutes: expiryMinutes }
        );

      if (channels.email !== false && user.email) {
        try {
          await sendEmail(user.email, 'Reset your Comrades360 password', resetMessage)
        } catch (emailError) {
          console.warn('[password-reset] Email delivery failed:', emailError.message)
        }
      }

      const smsCandidates = [
        user.phone,
        user.additionalPhone,
        looksLikeEmail ? null : rawIdentifier
      ]
        .map((p) => normalizeKenyanPhone(p))
        .filter(Boolean);

      const uniqueSmsNumbers = [...new Set(smsCandidates)];

      if (channels.sms !== false) {
        await sendToPhoneCandidates(uniqueSmsNumbers, resetMessage, 'sms', user.id);
      }

      if (channels.whatsapp === true) {
        await sendToPhoneCandidates(uniqueSmsNumbers, resetMessage, 'whatsapp', user.id);
      }
      
      if (socketId) {
        mirrorOtpToSocket(socketId, token, 'passwordReset');
      }
    }
    return res.json({ message: 'If that account exists, a reset code has been sent through enabled channels.' })
  } catch (e) {
    return res.status(500).json({ message: 'Server error requesting password reset.', error: e.message })
  }
}

const confirmPasswordReset = async (req, res) => {
  const { token, newPassword } = req.body || {}
  try {
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and newPassword are required.' })
    const pr = await PasswordReset.findOne({ where: { token, used: false, expiresAt: { [Op.gt]: new Date() } } })
    if (!pr) return res.status(400).json({ message: 'Invalid or expired token.' })
    const user = await User.findByPk(pr.userId)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    const hashed = await bcrypt.hash(newPassword, 10)
    user.password = hashed
    await user.save()
    pr.used = true
    await pr.save()
    return res.json({ message: 'Password has been reset successfully.' })
  } catch (e) {
    return res.status(500).json({ message: 'Server error confirming password reset.', error: e.message })
  }
}

module.exports = {
  requestPasswordReset,
  confirmPasswordReset
};
