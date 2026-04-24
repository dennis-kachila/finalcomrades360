const { User, Otp } = require('../models');
const { sendMessage } = require('../utils/messageService');
const { normalizeKenyanPhone } = require('../middleware/validators');

/**
 * Calculate and return user verification status
 * Checks 4 requirements: profile, address, email, phone
 */
const getVerificationStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const user = await User.findByPk(userId, {
            attributes: [
                'id', 'name', 'email', 'phone', 'role',
                'gender', 'dateOfBirth', 'bio',
                'county', 'town', 'estate', 'houseNumber',
                'emailVerified', 'phoneVerified', 'isVerified', 'nationalIdUrl', 'nationalIdStatus', 'nationalIdRejectionReason'
            ]
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isSuperAdmin = ['superadmin', 'super_admin', 'admin'].includes(user.role);

        console.log(`[Verification] User: ${user.email}, Role: ${user.role}, IsSuperAdmin: ${isSuperAdmin}, NatID: ${user.nationalIdUrl}`);

        // Check each requirement
        const checks = {
            profileComplete: isSuperAdmin || !!(user.gender && user.dateOfBirth),
            addressComplete: isSuperAdmin || !!(user.county && user.town && user.estate && user.houseNumber),
            emailVerified: isSuperAdmin || user.emailVerified === true,
            phoneVerified: isSuperAdmin || user.phoneVerified === true,
            nationalIdApproved: isSuperAdmin || user.nationalIdStatus === 'approved',
            nationalIdStatus: user.nationalIdStatus || 'none'
        };

        // Calculate if fully verified (only use essential boolean checks)
        const essentialChecks = {
            emailVerified: checks.emailVerified,
            phoneVerified: checks.phoneVerified,
            nationalIdApproved: checks.nationalIdApproved
        };
        const allVerified = Object.values(essentialChecks).every(v => v === true);

        // Update isVerified field if status changed
        if (typeof user.recalculateIsVerified === 'function') {
            await user.recalculateIsVerified();
        }

        // Determine missing steps for better UX
        const missingSteps = [];
        if (!checks.emailVerified) {
            missingSteps.push({
                step: 'emailVerified',
                title: 'Verify Your Email',
                description: 'Confirm your email address',
                link: '/account/verify-email'
            });
        }
        if (!checks.phoneVerified) {
            missingSteps.push({
                step: 'phoneVerified',
                title: 'Verify Your Phone',
                description: 'Confirm your phone number via SMS',
                link: '/account/verify-phone'
            });
        }
        if (!checks.nationalIdApproved) {
            const status = user.nationalIdStatus || 'none';
            let title = 'Upload National ID';
            let description = 'Upload a copy of your National ID for verification';

            if (status === 'pending') {
                title = 'National ID Pending Approval';
                description = 'Your document is under review. Please wait for admin approval.';
            } else if (status === 'rejected') {
                title = 'National ID Rejected';
                description = `Reason: ${user.nationalIdRejectionReason || 'Document invalid'}. Please re-upload.`;
            }

            missingSteps.push({
                step: 'nationalIdByAdmin',
                title,
                description,
                link: '/account/id-upload',
                status: status
            });
        }

        res.json({
            success: true,
            isFullyVerified: allVerified,
            checks,
            nationalIdStatus: user.nationalIdStatus,
            nationalIdRejectionReason: user.nationalIdRejectionReason,
            missingSteps,
            completionPercentage: Math.round((Object.values(essentialChecks).filter(v => v).length / Object.keys(essentialChecks).length) * 100),
            userData: {
                name: user.name,
                email: user.email,
                phone: user.phone,
                gender: user.gender,
                dateOfBirth: user.dateOfBirth,
                county: user.county,
                town: user.town,
                estate: user.estate,
                houseNumber: user.houseNumber
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Request Phone Verification OTP
 */
const requestPhoneVerificationOtp = async (req, res, next) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ message: 'Phone number is required' });

        const normalizedPhone = normalizeKenyanPhone(phone);
        if (!normalizedPhone) return res.status(400).json({ message: 'Invalid Kenyan phone number' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Clear existing OTPs for this phone
        await Otp.destroy({ where: { phone: normalizedPhone } });

        // Create new OTP
        await Otp.create({
            phone: normalizedPhone,
            otp,
            expiresAt
        });

        // Send OTP via SMS
        console.log(`[Verification] 🚀 Sending OTP ${otp} to ${normalizedPhone}`);
        await sendMessage(
            normalizedPhone,
            `Your Comrades360 verification code is: ${otp}. Valid for 10 minutes.`,
            'sms'
        );

        res.json({ success: true, message: 'Verification code sent successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Verify Phone OTP and update user
 */
const verifyPhoneOtp = async (req, res, next) => {
    try {
        const { phone, otp } = req.body;
        const userId = req.user.id;

        if (!phone || !otp) return res.status(400).json({ message: 'Phone and OTP are required' });

        const normalizedPhone = normalizeKenyanPhone(phone);
        if (!normalizedPhone) return res.status(400).json({ message: 'Invalid phone format' });

        // Check if OTP is valid
        const otpRecord = await Otp.findOne({
            where: { phone: normalizedPhone, otp }
        });

        if (!otpRecord) return res.status(400).json({ message: 'Invalid verification code' });
        if (new Date() > otpRecord.expiresAt) {
            await otpRecord.destroy();
            return res.status(400).json({ message: 'Verification code has expired' });
        }

        // OTP is valid, update user
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.phone = normalizedPhone;
        user.phoneVerified = true;
        await user.save();

        if (typeof user.recalculateIsVerified === 'function') {
            await user.recalculateIsVerified();
        }

        // Cleanup
        await otpRecord.destroy();

        res.json({
            success: true,
            message: 'Phone number verified successfully',
            phone: normalizedPhone
        });
    } catch (error) {
        next(error);
    }
};

const approveNationalId = async (req, res, next) => {
    const { userId } = req.params;
    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.nationalIdStatus = 'approved';
        await user.save();

        if (typeof user.recalculateIsVerified === 'function') {
            await user.recalculateIsVerified();
        }

        res.json({ message: 'National ID approved successfully' });
    } catch (error) {
        next(error);
    }
};

const rejectNationalId = async (req, res, next) => {
    const { userId } = req.params;
    const { reason } = req.body;
    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.nationalIdStatus = 'rejected';
        user.nationalIdRejectionReason = reason;
        await user.save();

        if (typeof user.recalculateIsVerified === 'function') {
            await user.recalculateIsVerified();
        }

        res.json({ message: 'National ID rejected successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getVerificationStatus,
    requestPhoneVerificationOtp,
    verifyPhoneOtp,
    approveNationalId,
    rejectNationalId
};
