const { User } = require('../models');

// Generate a random referral code
const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Generate a unique referral code for a user
const generateUniqueReferralCode = async () => {
  let isUnique = false;
  let code;
  
  while (!isUnique) {
    code = generateReferralCode();
    const existingUser = await User.findOne({ where: { referralCode: code } });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return code;
};

// Generate a referral link for a user
const generateReferralLink = (userId, referralCode) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://comrades360.shop';
  return `${baseUrl}/register?ref=${referralCode}`;
};

module.exports = {
  generateReferralCode,
  generateUniqueReferralCode,
  generateReferralLink
};
