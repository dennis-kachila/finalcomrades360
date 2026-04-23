const { Op, literal } = require('sequelize');
const { MarketingAnalytics, ReferralTracking, Commission, Product, Category, User, Order, OrderItem, FastFood: FastFoodModel } = require('../models/index');

// Helper: parse date range
const getDateRange = (query) => {
  const { from, to } = query || {};
  let where = {};
  if (from || to) {
    where = { [Op.and]: [] };
    if (from) where[Op.and].push({ createdAt: { [Op.gte]: new Date(from) } });
    if (to) where[Op.and].push({ createdAt: { [Op.lte]: new Date(to) } });
  }
  return where;
};

// Build common filters for product/category/platform
const buildFilters = ({ categoryId, productId, platform }) => {
  const filters = {};
  if (productId) filters.productId = Number(productId);
  if (platform) filters.platform = platform;
  // category filter applied after join via Product lookup when needed
  return { filters, categoryId: categoryId ? Number(categoryId) : null };
};

const getSummary = async (req, res) => {
  try {
    const dateWhere = getDateRange(req.query);
    const { filters, categoryId } = buildFilters(req.query);

    // MarketingAnalytics: shares, clicks, views, conversions
    const maWhere = { ...filters, ...dateWhere };
    const actions = await MarketingAnalytics.findAll({ where: maWhere, raw: true });
    const totalShares = actions.filter(a => a.actionType === 'share').length;
    const totalClicks = actions.filter(a => a.actionType === 'click').length;
    const totalViews = actions.filter(a => a.actionType === 'view').length;
    const totalConversions = actions.filter(a => a.actionType === 'conversion').length;

    // Commissions: amounts and status
    const comWhere = {};
    if (req.query.productId) comWhere.productId = Number(req.query.productId);
    if (dateWhere[Op.and]) comWhere.createdAt = { [Op.and]: dateWhere[Op.and].map(c => c.createdAt) };
    const commissions = await Commission.findAll({ where: comWhere, raw: true });

    // Optional category filter by joining Product
    let filteredCommissions = commissions;
    if (categoryId) {
      const productIds = (await Product.findAll({ where: { categoryId }, attributes: ['id'], raw: true })).map(p => p.id);
      filteredCommissions = commissions.filter(c => productIds.includes(c.productId));
    }

    const totalCommissionEarned = filteredCommissions.reduce((s, c) => s + (c.commissionAmount || 0), 0);
    const totalRevenueInfluenced = filteredCommissions.reduce((s, c) => s + (c.saleAmount || 0), 0);
    const statusBuckets = filteredCommissions.reduce((acc, c) => {
      const k = c.status || 'pending';
      acc[k] = (acc[k] || 0) + (c.commissionAmount || 0);
      return acc;
    }, {});

    // Basic platform breakdown
    const platformBreakdown = actions.reduce((acc, a) => {
      const p = a.platform || 'unknown';
      const m = acc[p] || { shares: 0, clicks: 0, views: 0, conversions: 0 };
      if (a.actionType === 'share') m.shares++;
      if (a.actionType === 'click') m.clicks++;
      if (a.actionType === 'view') m.views++;
      if (a.actionType === 'conversion') m.conversions++;
      acc[p] = m;
      return acc;
    }, {});

    // Compute derived KPIs
    const ctr = totalShares ? (totalClicks / totalShares) : 0;
    const cvr = totalClicks ? (totalConversions / totalClicks) : 0;
    const epc = totalClicks ? (totalCommissionEarned / totalClicks) : 0;
    const aov = totalConversions ? (totalRevenueInfluenced / totalConversions) : 0;

    return res.json({
      totalShares,
      totalClicks,
      totalViews,
      totalConversions,
      totalCommissionEarned,
      totalRevenueInfluenced,
      commissionByStatus: statusBuckets,
      platformBreakdown,
      ctr,
      cvr,
      epc,
      aov
    });
  } catch (err) {
    console.error('Admin getSummary error:', err);
    return res.status(500).json({ message: 'Failed to load admin marketing summary' });
  }
};

const getMarketersLeaderboard = async (req, res) => {
  try {
    const { from, to, sortBy = 'commission', limit = 20 } = req.query;
    const dateWhere = getDateRange({ from, to });

    // Commission aggregation per marketer
    const commissions = await Commission.findAll({ where: dateWhere, raw: true });
    const byMarketer = new Map();
    for (const c of commissions) {
      const m = byMarketer.get(c.marketerId) || { marketerId: c.marketerId, commission: 0, revenue: 0, conversions: 0 };
      m.commission += (c.commissionAmount || 0);
      m.revenue += (c.saleAmount || 0);
      m.conversions += 1;
      byMarketer.set(c.marketerId, m);
    }

    // Clicks from MarketingAnalytics
    const clicks = await MarketingAnalytics.findAll({ where: { actionType: 'click', ...dateWhere }, raw: true });
    for (const a of clicks) {
      const m = byMarketer.get(a.marketerId) || { marketerId: a.marketerId, commission: 0, revenue: 0, conversions: 0 };
      m.clicks = (m.clicks || 0) + 1;
      byMarketer.set(a.marketerId, m);
    }

    // Shares for CTR/EPC
    const shares = await MarketingAnalytics.findAll({ where: { actionType: 'share', ...dateWhere }, raw: true });
    for (const a of shares) {
      const m = byMarketer.get(a.marketerId) || { marketerId: a.marketerId, commission: 0, revenue: 0, conversions: 0 };
      m.shares = (m.shares || 0) + 1;
      byMarketer.set(a.marketerId, m);
    }

    const list = Array.from(byMarketer.values()).map(m => ({
      ...m,
      ctr: (m.shares ? (m.clicks || 0) / m.shares : 0),
      cvr: (m.clicks ? (m.conversions || 0) / m.clicks : 0),
      epc: (m.clicks ? (m.commission || 0) / m.clicks : 0),
    }));

    const sorters = {
      commission: (a,b)=> (b.commission||0)-(a.commission||0),
      revenue: (a,b)=> (b.revenue||0)-(a.revenue||0),
      conversions: (a,b)=> (b.conversions||0)-(a.conversions||0),
      clicks: (a,b)=> (b.clicks||0)-(a.clicks||0),
      ctr: (a,b)=> (b.ctr||0)-(a.ctr||0),
      cvr: (a,b)=> (b.cvr||0)-(a.cvr||0),
      epc: (a,b)=> (b.epc||0)-(a.epc||0),
    };
    const sorter = sorters[sortBy] || sorters.commission;
    list.sort(sorter);

    const resultList = list.slice(0, Number(limit) || 20);
    const ids = resultList.map(x => x.marketerId).filter(Boolean);

    // Attach basic marketer info and referral count
    const users = await User.findAll({ 
      where: { id: { [Op.in]: ids } }, 
      attributes: ['id', 'name', 'email', 'referralCode'],
      raw: true 
    });

    // Fetch referral counts separately for each user to avoid subquery alias issues in different dialects
    const withUsers = await Promise.all(resultList.map(async (item) => {
      const user = users.find(u => u.id === item.marketerId);
      let referralCount = 0;
      if (user) {
        // Count registrations
        const regCount = await User.count({ where: { referredByReferralCode: user.referralCode || '—' } });
        // Count orders (unique customers)
        const orderCustomers = await Order.count({
          where: { marketerId: user.id },
          distinct: true,
          col: 'customerEmail' // Fallback for guest orders
        });
        referralCount = regCount + orderCustomers;
      }
      return { ...item, user: user ? { ...user, referralCount } : null };
    }));

    return res.json({ items: withUsers });
  } catch (err) {
    console.error('Admin getMarketersLeaderboard error:', err);
    return res.status(500).json({ message: 'Failed to load marketers leaderboard' });
  }
};

const getMarketerProfile = async (req, res) => {
  try {
    const marketerId = Number(req.params.id);
    const dateWhere = getDateRange(req.query);
    console.log(`[DEBUG] Fetching profile for marketerId: ${marketerId}, FastFoodModel exists: ${!!FastFoodModel}`);

    // Fetch full user details for profile
    const user = await User.findByPk(marketerId, {
      attributes: [
        'id', 'name', 'email', 'phone', 'role', 'referralCode', 'isDeactivated',
        'gender', 'dateOfBirth', 'campus', 'county', 'town', 'estate', 'houseNumber',
        'nationalIdNumber', 'nationalIdStatus', 'nationalIdUrl', 'profileImage'
      ],
      raw: true
    });

    if (!user) {
      return res.status(404).json({ message: 'Marketer not found' });
    }

    // Referral count (registrations + unique customer orders)
    const regCount = await User.count({ where: { referredByReferralCode: user.referralCode || '—' } });
    const orderCustomers = await Order.count({
      where: { marketerId: user.id },
      distinct: true,
      col: 'customerEmail'
    });
    user.referralCount = regCount + orderCustomers;

    // KPIs from commissions
    const commissions = await Commission.findAll({ where: { marketerId, ...dateWhere }, raw: true });
    const totalCommission = commissions.reduce((s,c)=> s + (c.commissionAmount||0), 0);
    const totalRevenue = commissions.reduce((s,c)=> s + (c.saleAmount||0), 0);

    // Actions
    const actions = await MarketingAnalytics.findAll({ where: { marketerId, ...dateWhere }, raw: true });
    const totalShares = actions.filter(a=>a.actionType==='share').length;
    const totalClicks = actions.filter(a=>a.actionType==='click').length;
    const totalConversions = commissions.length; // conservative: confirmed by commission records

    // Group performance by product/fastfood/service
    const performanceMap = {};
    const getGroupId = (c) => {
      if (c.productId) return `prod_${c.productId}`;
      if (c.fastFoodId) return `ff_${c.fastFoodId}`;
      if (c.serviceId) return `svc_${c.serviceId}`;
      return 'other';
    };

    for (const c of commissions) {
      const gId = getGroupId(c);
      const row = performanceMap[gId] || {
        productId: c.productId,
        fastFoodId: c.fastFoodId,
        serviceId: c.serviceId,
        revenue: 0,
        commission: 0,
        conversions: 0,
        shares: 0,
        clicks: 0
      };
      row.revenue += (c.saleAmount || 0);
      row.commission += (c.commissionAmount || 0);
      row.conversions += 1;
      performanceMap[gId] = row;
    }

    // Add clicks/shares from MarketingAnalytics
    for (const a of actions) {
      const gId = getGroupId(a);
      if (performanceMap[gId]) {
        if (a.actionType === 'click') performanceMap[gId].clicks += 1;
        if (a.actionType === 'share') performanceMap[gId].shares += 1;
      } else {
        performanceMap[gId] = {
          productId: a.productId,
          fastFoodId: a.fastFoodId,
          serviceId: a.serviceId,
          revenue: 0,
          commission: 0,
          conversions: 0,
          shares: (a.actionType === 'share' ? 1 : 0),
          clicks: (a.actionType === 'click' ? 1 : 0)
        };
      }
    }

    // Attach metadata (names) for all items
    const productIds = Object.values(performanceMap).map(r => r.productId).filter(Boolean);
    const fastFoodIds = Object.values(performanceMap).map(r => r.fastFoodId).filter(Boolean);

    const [products, fastfoods] = await Promise.all([
      productIds.length > 0 
        ? Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ['id', 'name', 'categoryId'], raw: true })
        : Promise.resolve([]),
      fastFoodIds.length > 0
        ? FastFoodModel.findAll({ where: { id: { [Op.in]: fastFoodIds } }, attributes: ['id', 'name'], raw: true })
        : Promise.resolve([])
    ]);


    const cats = await Category.findAll({ attributes: ['id', 'name'], raw: true });
    const catById = new Map(cats.map(c => [c.id, c.name]));

    const items = Object.values(performanceMap).map(row => {
      let itemName = 'Unknown Item';
      let categoryName = 'Uncategorized';
      let itemType = 'other';

      if (row.productId) {
        const p = products.find(prod => prod.id === row.productId);
        itemName = p ? p.name : `Product #${row.productId}`;
        categoryName = p ? (catById.get(p.categoryId) || 'Uncategorized') : 'Uncategorized';
        itemType = 'product';
      } else if (row.fastFoodId) {
        const ff = fastfoods.find(f => f.id === row.fastFoodId);
        itemName = ff ? ff.name : `FastFood #${row.fastFoodId}`;
        categoryName = 'Fast Food';
        itemType = 'fastfood';
      } else if (row.serviceId) {
        itemName = `Service #${row.serviceId}`;
        categoryName = 'Service';
        itemType = 'service';
      }

      const ctr = row.shares ? (row.clicks || 0) / row.shares : 0;
      const cvr = row.clicks ? (row.conversions || 0) / row.clicks : 0;

      return { ...row, productName: itemName, categoryName, itemType, ctr, cvr };
    });

    const ctr = totalShares ? (totalClicks / totalShares) : 0;
    const cvr = totalClicks ? (totalConversions / totalClicks) : 0;
    const epc = totalClicks ? (totalCommission / totalClicks) : 0;

    return res.json({
      marketerId,
      profile: user,
      kpis: { totalShares, totalClicks, totalConversions, totalRevenue, totalCommission, ctr, cvr, epc },
      productPerformance: items,
    });
  } catch (err) {
    console.error('Admin getMarketerProfile error:', err);
    return res.status(500).json({ 
      message: 'Failed to load marketer profile',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
  }
};

module.exports = {
  getSummary,
  getMarketersLeaderboard,
  getMarketerProfile
};
