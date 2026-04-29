const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const User = require('../models/User');
const { isValidEmail, normalizeKenyanPhone } = require('../middleware/validators');
const { getDynamicMessage } = require('../utils/templateUtils');
const { Notification } = require('../models/index');
const { sendEmail } = require('../utils/mailer');
const { sendMessage } = require('../utils/messageService');
const { mirrorOtpToSocket } = require('../utils/otpUtils');

// Step 1: Initiate change - generate token to NEW email + OTP to CURRENT phone
const initiateSecurityChange = async (req, res) => {
  const userId = req.user.id
  const { newEmail, socketId } = req.body || {}
  try {
    const user = await User.findByPk(userId)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    if (user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can use this endpoint.' })

    // Validate email
    if (!isValidEmail(newEmail)) return res.status(400).json({ message: 'Invalid email.' })
    if (user.email === newEmail) return res.status(400).json({ message: 'New email is the same as current email.' })
    const existing = await User.findOne({ where: { email: newEmail, id: { [Op.ne]: userId } } })
    if (existing) return res.status(400).json({ message: 'Email already in use.' })

    // Generate email token (to NEW email)
    const emailToken = Math.random().toString(36).slice(2) + Date.now().toString(36)
    user.pendingEmail = newEmail
    user.emailChangeToken = emailToken
    user.emailChangeExpiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Generate phone OTP (to CURRENT phone)
    const otp = `${Math.floor(100000 + Math.random() * 900000)}`
    const normPhone = normalizeKenyanPhone(user.phone) || user.phone
    user.phoneOtp = otp
    user.phoneOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await user.save()

    // Notify via channels (best-effort)
    try { await sendEmail(newEmail, 'Confirm Email (Super Admin)', `Your verification token is: ${emailToken}`) } catch {}
    try { 
      if (normPhone) {
        const message = await getDynamicMessage(
          'securityChangeOtp',
          `Your Comrades360 OTP is ${otp}. It expires in 10 minutes.\n\n@comrades360.shop #${otp}`,
          { otp }
        );
        await sendMessage(normPhone, message, 'sms') 
        
        if (socketId) {
            mirrorOtpToSocket(socketId, otp, 'securityChange');
        }
      }
    } catch {}
    try { await Notification.create({ userId, title: 'Security Change Initiated', message: 'We sent a token to your new email and an OTP to your phone.' }) } catch {}

    return res.json({ message: 'Security change initiated. Check new email for token and phone for OTP.' })
  } catch (e) {
    return res.status(500).json({ message: 'Server error initiating security change.', error: e.message })
  }
}

// Step 2: Finalize - verify current password + email token + phone OTP, then update
const finalizeSecurityChange = async (req, res) => {
  const userId = req.user.id
  const { currentPassword, emailToken, phoneOtp, newPassword } = req.body || {}
  try {
    const user = await User.findByPk(userId)
    if (!user) return res.status(404).json({ message: 'User not found.' })
    if (user.role !== 'super_admin') return res.status(403).json({ message: 'Only super admin can use this endpoint.' })

    // Verify factors
    if (!currentPassword || !newPassword || !emailToken || !phoneOtp) {
      return res.status(400).json({ message: 'All fields are required: currentPassword, newPassword, emailToken, phoneOtp.' })
    }

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' })

    if (!user.emailChangeToken || !user.pendingEmail) return res.status(400).json({ message: 'No email change pending.' })
    if (user.emailChangeToken !== emailToken) return res.status(400).json({ message: 'Invalid email token.' })
    if (user.emailChangeExpiresAt && new Date(user.emailChangeExpiresAt) < new Date()) return res.status(400).json({ message: 'Email token expired.' })

    if (!user.phoneOtp) return res.status(400).json({ message: 'No OTP pending.' })
    if (user.phoneOtp !== phoneOtp) return res.status(400).json({ message: 'Invalid phone OTP.' })
    if (user.phoneOtpExpiresAt && new Date(user.phoneOtpExpiresAt) < new Date()) return res.status(400).json({ message: 'Phone OTP expired.' })

    // Apply changes
    const hashed = await bcrypt.hash(newPassword, 10)
    user.password = hashed
    user.email = user.pendingEmail

    // Clear pending fields
    user.pendingEmail = null
    user.emailChangeToken = null
    user.emailChangeExpiresAt = null
    user.phoneOtp = null
    user.phoneOtpExpiresAt = null

    await user.save()
    try { await Notification.create({ userId, title: 'Security Change Completed', message: 'Your email and password were updated.' }) } catch {}

    return res.json({ message: 'Super admin email and password updated successfully.' })
  } catch (e) {
    return res.status(500).json({ message: 'Server error finalizing security change.', error: e.message })
  }
}

module.exports = {
  initiateSecurityChange,
  finalizeSecurityChange
};
