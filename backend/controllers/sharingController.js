const Product = require('../models/Product');
const ReferralTracking = require('../models/ReferralTracking');
const User = require('../models/User');
const ProductView = require('../models/ProductView');
const MarketingAnalytics = require('../models/MarketingAnalytics');
const { v4: uuidv4 } = require('uuid');

// Generate shareable product link
const generateProductLink = async (productId, marketerId) => {
  try {
    const product = await Product.findByPk(productId);
    const marketer = await User.findByPk(marketerId);
    
    if (!product || !marketer) return null;
    
    const linkId = uuidv4().slice(0, 8);
    const shareableLink = `${process.env.FRONTEND_URL || 'https://comrades360.shop'}/product/${productId}?ref=${marketer.referralCode}&link=${linkId}`;
    
    // Update product with shareable link if not exists
    if (!product.shareableLink) {
      await product.update({ shareableLink: linkId });
    }
    
    return shareableLink;
  } catch (error) {
    console.error('Error generating product link:', error);
    return null;
  }
};

// Track referral click with enhanced analytics
const trackReferralClick = async (req, res) => {
  try {
    const { productId, referralCode, platform = 'direct' } = req.body;
    const { 'user-agent': userAgent } = req.headers;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userId = req.user?.userId || null;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const marketer = await User.findOne({ where: { referralCode } });
    if (!marketer) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Detect device type
    const deviceType = /Mobile|Android|iPhone|iPad/.test(userAgent) ? 'mobile' : 
                      /Tablet/.test(userAgent) ? 'tablet' : 'desktop';

    // Create tracking record
    const tracking = await ReferralTracking.create({
      productId,
      marketerId: marketer.id,
      platform,
      ipAddress,
      userAgent,
      actionType: 'click'
    });

    // Create marketing analytics record
    await MarketingAnalytics.create({
      marketerId: marketer.id,
      productId,
      platform,
      actionType: 'click',
      userId,
      ipAddress,
      userAgent,
      deviceType,
      referralCode,
      shareUrl: req.get('Referer') || '',
      metadata: {
        timestamp: new Date(),
        sessionId: req.sessionID || 'anonymous'
      }
    });

    res.json({ 
      message: 'Click tracked successfully',
      productId,
      marketerId: marketer.id,
      trackingId: tracking.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get comprehensive marketing analytics
const getSharingAnalytics = async (req, res) => {
  try {
    const marketerId = req.user.userId;
    
    // Get all marketing analytics for this marketer
    const analytics = await MarketingAnalytics.findAll({
      where: { marketerId },
      include: [{
        model: Product,
        attributes: ['name', 'displayPrice', 'commissionRate']
      }],
      order: [['createdAt', 'DESC']]
    });

    // Get product views
    const views = await ProductView.findAll({
      where: { marketerId },
      include: [{
        model: Product,
        attributes: ['name', 'displayPrice']
      }]
    });

    // Calculate comprehensive stats
    const stats = {
      totalShares: analytics.filter(a => a.actionType === 'share').length,
      totalClicks: analytics.filter(a => a.actionType === 'click').length,
      totalViews: views.length,
      totalConversions: analytics.filter(a => a.actionType === 'conversion').length,
      totalCommissionEarned: analytics.reduce((sum, a) => sum + (a.commissionEarned || 0), 0),
      platformBreakdown: {},
      deviceBreakdown: {},
      productPerformance: {},
      recentActivity: analytics.slice(0, 20)
    };

    // Platform breakdown
    analytics.forEach(a => {
      const platform = a.platform || 'direct';
      if (!stats.platformBreakdown[platform]) {
        stats.platformBreakdown[platform] = { shares: 0, clicks: 0, conversions: 0, views: 0 };
      }
      if (a.actionType === 'share') stats.platformBreakdown[platform].shares++;
      if (a.actionType === 'click') stats.platformBreakdown[platform].clicks++;
      if (a.actionType === 'conversion') stats.platformBreakdown[platform].conversions++;
    });

    views.forEach(v => {
      const platform = v.referralSource || 'direct';
      if (!stats.platformBreakdown[platform]) {
        stats.platformBreakdown[platform] = { shares: 0, clicks: 0, conversions: 0, views: 0 };
      }
      stats.platformBreakdown[platform].views++;
    });

    // Device breakdown
    [...analytics, ...views].forEach(item => {
      const device = item.deviceType || 'unknown';
      stats.deviceBreakdown[device] = (stats.deviceBreakdown[device] || 0) + 1;
    });

    // Product performance
    analytics.forEach(a => {
      const productId = a.productId;
      if (!stats.productPerformance[productId]) {
        stats.productPerformance[productId] = {
          product: a.Product,
          shares: 0,
          clicks: 0,
          views: 0,
          conversions: 0,
          commissionEarned: 0
        };
      }
      if (a.actionType === 'share') stats.productPerformance[productId].shares++;
      if (a.actionType === 'click') stats.productPerformance[productId].clicks++;
      if (a.actionType === 'conversion') {
        stats.productPerformance[productId].conversions++;
        stats.productPerformance[productId].commissionEarned += (a.commissionEarned || 0);
      }
    });

    views.forEach(v => {
      const productId = v.productId;
      if (stats.productPerformance[productId]) {
        stats.productPerformance[productId].views++;
      }
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Track product view
const trackProductView = async (req, res) => {
  try {
    const { productId, referralCode, platform = 'direct', viewDuration = 0 } = req.body;
    const { 'user-agent': userAgent } = req.headers;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userId = req.user?.userId || null;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let marketerId = null;
    if (referralCode) {
      const marketer = await User.findOne({ where: { referralCode } });
      if (marketer) marketerId = marketer.id;
    }

    const deviceType = /Mobile|Android|iPhone|iPad/.test(userAgent) ? 'mobile' : 
                      /Tablet/.test(userAgent) ? 'tablet' : 'desktop';

    // Create product view record
    await ProductView.create({
      productId,
      userId,
      marketerId,
      ipAddress,
      userAgent,
      referralSource: platform,
      viewDuration,
      deviceType,
      sessionId: req.sessionID || 'anonymous'
    });

    // Track in marketing analytics if from marketer
    if (marketerId) {
      await MarketingAnalytics.create({
        marketerId,
        productId,
        platform,
        actionType: 'view',
        userId,
        ipAddress,
        userAgent,
        deviceType,
        referralCode,
        metadata: {
          viewDuration,
          timestamp: new Date()
        }
      });
    }

    res.json({ message: 'View tracked successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Track social media share
const trackShare = async (req, res) => {
  try {
    const { productId, platform } = req.body;
    const marketerId = req.user.userId;
    const { 'user-agent': userAgent } = req.headers;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const product = await Product.findByPk(productId);
    const marketer = await User.findByPk(marketerId);
    
    if (!product || !marketer) {
      return res.status(404).json({ error: 'Product or marketer not found' });
    }

    const deviceType = /Mobile|Android|iPhone|iPad/.test(userAgent) ? 'mobile' : 
                      /Tablet/.test(userAgent) ? 'tablet' : 'desktop';

    const shareUrl = `${process.env.FRONTEND_URL || 'https://comrades360.shop'}/share/${productId}?ref=${marketer.referralCode}&platform=${platform}`;

    // Track the share action
    await MarketingAnalytics.create({
      marketerId,
      productId,
      platform,
      actionType: 'share',
      userId: marketerId,
      ipAddress,
      userAgent,
      deviceType,
      referralCode: marketer.referralCode,
      shareUrl,
      metadata: {
        timestamp: new Date(),
        shareMethod: 'direct_share'
      }
    });

    res.json({ message: 'Share tracked successfully', shareUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate social media sharing content for all platforms
const generateSharingContent = async (req, res) => {
  try {
    const { productId } = req.params;
    const marketerId = req.user.userId;
    
    const product = await Product.findByPk(productId);
    const marketer = await User.findByPk(marketerId);
    
    if (!product || !marketer) {
      return res.status(404).json({ error: 'Product or marketer not found' });
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://comrades360.shop';
    const shareLink = `${baseUrl}/share/${productId}?ref=${marketer.referralCode}`;
    const discountText = product.isFlashSale ? `🔥 ${product.discountPercentage}% OFF!` : '';
    const priceText = product.isFlashSale ? 
      `~~KES ${product.originalPrice}~~ **KES ${product.displayPrice}**` : 
      `**KES ${product.displayPrice}**`;
    
    const content = {
      whatsapp: {
        text: `🛍️ *${product.name}* ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\n🔗 Shop now: ${shareLink}\n\n_Shared by ${marketer.name} on Comrades360_`,
        shareUrl: `https://wa.me/?text=${encodeURIComponent(`🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 Only KES ${product.displayPrice}\n\n🔗 ${shareLink}\n\nShared by ${marketer.name}`)}`
      },
      
      facebook: {
        text: `🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\nGet yours now: ${shareLink}\n\n#StudentDeals #Comrades360 #KenyaStudents`,
        shareUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}&quote=${encodeURIComponent(`🛍️ ${product.name} - ${product.description} - KES ${product.displayPrice}`)}`
      },
      
      twitter: {
        text: `🛍️ ${product.name} ${discountText}\n\n${product.description.substring(0, 80)}...\n\n💰 ${priceText}\n\n${shareLink}\n\n#StudentDeals #Comrades360 #KenyaStudents`,
        shareUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`🛍️ ${product.name} ${discountText}\n\n${product.description.substring(0, 80)}...\n\n💰 KES ${product.displayPrice}\n\n${shareLink}\n\n#StudentDeals #Comrades360`)}`
      },
      
      instagram: {
        text: `🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\nLink in bio or DM for details!\n\n#StudentLife #Deals #Comrades360 #KenyaStudents #StudentMarketplace`,
        shareUrl: shareLink // Instagram doesn't support direct sharing URLs
      },
      
      telegram: {
        text: `🛍️ *${product.name}* ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\n🔗 [Shop Now](${shareLink})\n\n_Shared by ${marketer.name} on Comrades360_`,
        shareUrl: `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(`🛍️ ${product.name} - KES ${product.displayPrice}`)}`
      },
      
      tiktok: {
        text: `🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\nCheck link in bio! 👆\n\n#StudentDeals #Comrades360 #KenyaStudents #StudentLife #Deals`,
        shareUrl: shareLink // TikTok doesn't support direct sharing URLs
      },
      
      linkedin: {
        text: `🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\nPerfect for students and young professionals.\n\n${shareLink}\n\n#StudentDeals #Comrades360 #KenyaStudents #ProfessionalLife`,
        shareUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareLink)}`
      },
      
      email: {
        subject: `Check out this deal: ${product.name} ${discountText}`,
        body: `Hi there!\n\nI found this amazing deal on Comrades360 that I thought you'd love:\n\n🛍️ ${product.name} ${discountText}\n\n${product.description}\n\n💰 ${priceText}\n\nCheck it out here: ${shareLink}\n\nBest regards,\n${marketer.name}`,
        shareUrl: `mailto:?subject=${encodeURIComponent(`Check out: ${product.name}`)}&body=${encodeURIComponent(`Hi!\n\nCheck out this deal: ${product.name} - KES ${product.displayPrice}\n\n${shareLink}\n\nShared by ${marketer.name}`)}`
      }
    };

    res.json({ content, shareLink, product: { name: product.name, price: product.displayPrice } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


module.exports = {
  generateProductLink,
  trackReferralClick,
  getSharingAnalytics,
  trackProductView,
  trackShare,
  generateSharingContent
};
