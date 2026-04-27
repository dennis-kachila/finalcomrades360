const { Order, OrderItem, Product, User, Payment, DeliveryTask, Commission, sequelize } = require('../models');
const { Op, fn, col, literal } = require('sequelize');

/**
 * Analytics Controller
 * Provides historical trends, revenue forecasting, seller scoring, delivery metrics, and marketing ROI
 */

// Historical Trend Analysis
const getHistoricalTrends = async (req, res) => {
  try {
    const { startDate, endDate, interval = 'day' } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Determine date grouping based on interval
    let dateFormat;
    if (sequelize.options.dialect === 'sqlite') {
      dateFormat = interval === 'month' 
        ? "strftime('%Y-%m', createdAt)"
        : "strftime('%Y-%m-%d', createdAt)";
    } else {
      dateFormat = interval === 'month'
        ? "DATE_FORMAT(createdAt, '%Y-%m')"
        : "DATE(createdAt)";
    }

    // Orders trend
    const ordersTrend = await Order.findAll({
      attributes: [
        [literal(dateFormat), 'date'],
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('total')), 'revenue']
      ],
      where: {
        createdAt: { [Op.between]: [start, end] }
      },
      group: [literal(dateFormat)],
      order: [[literal(dateFormat), 'ASC']],
      raw: true
    });

    // New users trend
    const usersTrend = await User.findAll({
      attributes: [
        [literal(dateFormat), 'date'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        createdAt: { [Op.between]: [start, end] }
      },
      group: [literal(dateFormat)],
      order: [[literal(dateFormat), 'ASC']],
      raw: true
    });

    // Product views trend (if tracking)
    const productsAdded = await Product.findAll({
      attributes: [
        [literal(dateFormat), 'date'],
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        createdAt: { [Op.between]: [start, end] }
      },
      group: [literal(dateFormat)],
      order: [[literal(dateFormat), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      interval,
      dateRange: { start, end },
      trends: {
        orders: ordersTrend,
        users: usersTrend,
        products: productsAdded
      }
    });
  } catch (error) {
    console.error('Error fetching historical trends:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trends', error: error.message });
  }
};

// Revenue Forecasting
const getRevenueForecast = async (req, res) => {
  try {
    const { months = 3 } = req.query;
    
    // Get last 6 months of revenue data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalRevenue = await Order.findAll({
      attributes: [
        [fn('YEAR', col('createdAt')), 'year'],
        [fn('MONTH', col('createdAt')), 'month'],
        [fn('SUM', col('total')), 'revenue'],
        [fn('COUNT', col('id')), 'orderCount']
      ],
      where: {
        createdAt: { [Op.gte]: sixMonthsAgo },
        status: { [Op.in]: ['completed', 'delivered'] }
      },
      group: [fn('YEAR', col('createdAt')), fn('MONTH', col('createdAt'))],
      order: [[fn('YEAR', col('createdAt')), 'ASC'], [fn('MONTH', col('createdAt')), 'ASC']],
      raw: true
    });

    // Simple linear regression forecast
    const revenues = historicalRevenue.map(r => parseFloat(r.revenue) || 0);
    const avgRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    
    // Calculate growth rate
    const recentRevenues = revenues.slice(-3);
    const olderRevenues = revenues.slice(0, 3);
    const recentAvg = recentRevenues.reduce((a, b) => a + b, 0) / recentRevenues.length;
    const olderAvg = olderRevenues.reduce((a, b) => a + b, 0) / olderRevenues.length;
    const growthRate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

    // Generate forecast
    const forecast = [];
    const currentDate = new Date();
    for (let i = 1; i <= parseInt(months); i++) {
      const forecastDate = new Date(currentDate);
      forecastDate.setMonth(forecastDate.getMonth() + i);
      
      const predictedRevenue = avgRevenue * (1 + growthRate * i);
      forecast.push({
        year: forecastDate.getFullYear(),
        month: forecastDate.getMonth() + 1,
        predictedRevenue: Math.round(predictedRevenue),
        confidence: Math.max(0.5, 1 - (i * 0.1)) // Confidence decreases with time
      });
    }

    res.json({
      success: true,
      historical: historicalRevenue,
      growthRate: (growthRate * 100).toFixed(2) + '%',
      forecast
    });
  } catch (error) {
    console.error('Error generating revenue forecast:', error);
    res.status(500).json({ success: false, message: 'Failed to generate forecast', error: error.message });
  }
};

// Seller Performance Scoring
const getSellerPerformanceScores = async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const isSqlite = sequelize.getDialect() === 'sqlite';

    const sellers = await User.findAll({
      where: {
        [Op.or]: isSqlite ? [
          { role: 'seller' },
          { roles: { [Op.like]: '%"seller"%' } }
        ] : [
          { role: 'seller' },
          sequelize.where(
            sequelize.fn('JSON_CONTAINS', sequelize.col('roles'), sequelize.fn('JSON_QUOTE', 'seller')),
            1
          )
        ]
      },
      attributes: ['id', 'name', 'email', 'createdAt'],
      limit: parseInt(limit)
    });

    const performanceScores = await Promise.all(sellers.map(async (seller) => {
      // Get seller stats
      const orders = await Order.count({ where: { sellerId: seller.id } });
      const completedOrders = await Order.count({ 
        where: { sellerId: seller.id, status: 'completed' } 
      });
      const revenue = await Order.sum('total', { 
        where: { sellerId: seller.id, status: { [Op.in]: ['completed', 'delivered'] } } 
      }) || 0;
      
      const products = await Product.count({ where: { sellerId: seller.id } });
      const activeProducts = await Product.count({ 
        where: { sellerId: seller.id, approved: true } 
      });
      
      // Calculate average delivery time
      const avgDeliveryTime = await Order.findAll({
        where: { 
          sellerId: seller.id, 
          status: 'delivered',
          actualDelivery: { [Op.ne]: null }
        },
        attributes: [[
          fn('AVG', 
            literal("JULIANDAY(actualDelivery) - JULIANDAY(createdAt)")
          ), 
          'avgDays'
        ]],
        raw: true
      });

      // Calculate performance score (0-100)
      const completionRate = orders > 0 ? (completedOrders / orders) * 100 : 0;
      const productApprovalRate = products > 0 ? (activeProducts / products) * 100 : 0;
      const revenueScore = Math.min((revenue / 100000) * 100, 100); // Max score at 100k
      const deliveryDays = parseFloat(avgDeliveryTime[0]?.avgDays) || 0;
      const deliveryScore = deliveryDays > 0 ? Math.max(0, 100 - (deliveryDays * 5)) : 50;

      const overallScore = (
        completionRate * 0.3 +
        productApprovalRate * 0.2 +
        revenueScore * 0.3 +
        deliveryScore * 0.2
      ).toFixed(2);

      return {
        sellerId: seller.id,
        sellerName: seller.name,
        email: seller.email,
        stats: {
          totalOrders: orders,
          completedOrders,
          revenue: parseFloat(revenue).toFixed(2),
          totalProducts: products,
          activeProducts,
          avgDeliveryDays: deliveryDays.toFixed(1)
        },
        scores: {
          completionRate: completionRate.toFixed(2),
          productApprovalRate: productApprovalRate.toFixed(2),
          revenueScore: revenueScore.toFixed(2),
          deliveryScore: deliveryScore.toFixed(2),
          overallScore
        },
        rating: overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Fair' : 'Needs Improvement'
      };
    }));

    performanceScores.sort((a, b) => parseFloat(b.scores.overallScore) - parseFloat(a.scores.overallScore));

    res.json({
      success: true,
      sellers: performanceScores
    });
  } catch (error) {
    console.error('Error calculating seller performance:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate performance', error: error.message });
  }
};

// Delivery Efficiency Metrics
const getDeliveryEfficiencyMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Overall delivery stats
    const totalDeliveries = await DeliveryTask.count({
      where: {
        createdAt: { [Op.between]: [start, end] },
        status: { [Op.in]: ['completed', 'delivered'] }
      }
    });

    const onTimeDeliveries = await DeliveryTask.count({
      where: {
        createdAt: { [Op.between]: [start, end] },
        status: { [Op.in]: ['completed', 'delivered'] },
        completedAt: { [Op.lte]: col('estimatedDelivery') }
      }
    });

    // Average delivery time
    const avgDeliveryTime = await DeliveryTask.findAll({
      where: {
        createdAt: { [Op.between]: [start, end] },
        status: { [Op.in]: ['completed', 'delivered'] },
        completedAt: { [Op.ne]: null }
      },
      attributes: [[
        fn('AVG', 
          literal("ROUND((JULIANDAY(completedAt) - JULIANDAY(assignedAt)) * 24, 2)")
        ), 
        'avgHours'
      ]],
      raw: true
    });

    // Delivery agent performance
    const agentPerformance = await DeliveryTask.findAll({
      where: {
        createdAt: { [Op.between]: [start, end] },
        deliveryAgentId: { [Op.ne]: null }
      },
      attributes: [
        'deliveryAgentId',
        [fn('COUNT', col('id')), 'totalDeliveries'],
        [fn('SUM', literal("CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END")), 'completed'],
        [fn('AVG', literal("CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END")), 'avgRating']
      ],
      group: ['deliveryAgentId'],
      include: [{
        model: User,
        as: 'deliveryAgent',
        attributes: ['name', 'email', 'businessName']
      }],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 20
    });

    // Failed deliveries analysis
    const failedDeliveries = await DeliveryTask.count({
      where: {
        createdAt: { [Op.between]: [start, end] },
        status: 'failed'
      }
    });

    res.json({
      success: true,
      dateRange: { start, end },
      metrics: {
        totalDeliveries,
        onTimeDeliveries,
        onTimeRate: totalDeliveries > 0 ? ((onTimeDeliveries / totalDeliveries) * 100).toFixed(2) + '%' : 'N/A',
        avgDeliveryTimeHours: parseFloat(avgDeliveryTime[0]?.avgHours || 0).toFixed(2),
        failedDeliveries,
        failureRate: totalDeliveries > 0 ? ((failedDeliveries / totalDeliveries) * 100).toFixed(2) + '%' : 'N/A'
      },
      agentPerformance: agentPerformance.map(a => ({
        agentId: a.deliveryAgentId,
        agentName: a.deliveryAgent?.name,
        totalDeliveries: a.dataValues.totalDeliveries,
        completed: a.dataValues.completed,
        completionRate: ((a.dataValues.completed / a.dataValues.totalDeliveries) * 100).toFixed(2) + '%',
        avgRating: parseFloat(a.dataValues.avgRating || 0).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Error fetching delivery metrics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch delivery metrics', error: error.message });
  }
};

// Marketing Campaign ROI Tracking
const getMarketingCampaignROI = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const isSqlite = sequelize.getDialect() === 'sqlite';

    // Get all marketers with their referral codes
    const marketers = await User.findAll({
      where: {
        [Op.or]: isSqlite ? [
          { role: 'marketer' },
          { roles: { [Op.like]: '%"marketer"%' } }
        ] : [
          { role: 'marketer' },
          sequelize.where(
            sequelize.fn('JSON_CONTAINS', sequelize.col('roles'), sequelize.fn('JSON_QUOTE', 'marketer')),
            1
          )
        ],
        referralCode: { [Op.ne]: null }
      },
      attributes: ['id', 'name', 'email', 'referralCode']
    });

    const campaignROI = await Promise.all(marketers.map(async (marketer) => {
      // Orders through this marketer's referral code
      const orders = await Order.findAll({
        where: {
          [Op.or]: [
            { primaryReferralCode: marketer.referralCode },
            { secondaryReferralCode: marketer.referralCode }
          ],
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [fn('COUNT', col('id')), 'orderCount'],
          [fn('SUM', col('total')), 'totalRevenue']
        ],
        raw: true
      });

      // Commissions earned
      const commissions = await Commission.findAll({
        where: {
          marketerId: marketer.id,
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [fn('SUM', col('amount')), 'totalCommission'],
          [fn('SUM', literal("CASE WHEN status = 'paid' THEN amount ELSE 0 END")), 'paidCommission']
        ],
        raw: true
      });

      // New users referred
      const referredUsers = await User.count({
        where: {
          referredByReferralCode: marketer.referralCode,
          createdAt: { [Op.between]: [start, end] }
        }
      });

      const orderCount = parseInt(orders[0]?.orderCount) || 0;
      const revenue = parseFloat(orders[0]?.totalRevenue) || 0;
      const totalCommission = parseFloat(commissions[0]?.totalCommission) || 0;
      const paidCommission = parseFloat(commissions[0]?.paidCommission) || 0;

      // Calculate ROI (Revenue generated vs Commission paid)
      const roi = totalCommission > 0 ? ((revenue - totalCommission) / totalCommission * 100) : 0;

      return {
        marketerId: marketer.id,
        marketerName: marketer.name,
        referralCode: marketer.referralCode,
        performance: {
          ordersGenerated: orderCount,
          revenueGenerated: revenue.toFixed(2),
          newCustomersReferred: referredUsers,
          totalCommissionEarned: totalCommission.toFixed(2),
          paidCommission: paidCommission.toFixed(2),
          pendingCommission: (totalCommission - paidCommission).toFixed(2)
        },
        metrics: {
          roi: roi.toFixed(2) + '%',
          avgOrderValue: orderCount > 0 ? (revenue / orderCount).toFixed(2) : '0',
          conversionRate: referredUsers > 0 ? ((orderCount / referredUsers) * 100).toFixed(2) + '%' : 'N/A'
        }
      };
    }));

    // Sort by revenue generated
    campaignROI.sort((a, b) => parseFloat(b.performance.revenueGenerated) - parseFloat(a.performance.revenueGenerated));

    res.json({
      success: true,
      dateRange: { start, end },
      campaigns: campaignROI,
      summary: {
        totalMarketers: campaignROI.length,
        totalRevenue: campaignROI.reduce((sum, c) => sum + parseFloat(c.performance.revenueGenerated), 0).toFixed(2),
        totalCommissionPaid: campaignROI.reduce((sum, c) => sum + parseFloat(c.performance.paidCommission), 0).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error calculating marketing ROI:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate ROI', error: error.message });
  }
};

// General Platform Overview Stats
const getGeneralOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const [
      totalUsers,
      totalOrders,
      totalRevenue,
      totalProducts,
      activeUsers
    ] = await Promise.all([
      User.count(),
      Order.count({ where: { status: { [Op.in]: ['completed', 'delivered'] } } }),
      Order.sum('total', { where: { status: { [Op.in]: ['completed', 'delivered'] } } }),
      Product.count(),
      Order.count({
        distinct: true,
        col: 'userId',
        where: { createdAt: { [Op.between]: [start, end] } }
      })
    ]);

    const conversionRate = totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        totalOrders,
        totalRevenue: parseFloat(totalRevenue || 0),
        totalProducts,
        activeUsers,
        conversionRate: parseFloat(conversionRate.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error fetching general overview:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch overview stats', error: error.message });
  }
};

// Growth Poster Data
const getGrowthPosterData = async (req, res) => {
  try {
    const { period = 'day', date } = req.query;
    
    let start, end;
    const selectedDate = date ? new Date(date) : new Date();

    if (period === 'day') {
      start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(selectedDate);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'year') {
      start = new Date(selectedDate.getFullYear(), 0, 1);
      end = new Date(selectedDate.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    const isSqlite = sequelize.getDialect() === 'sqlite';

    const getRoleCount = (roleName) => {
      const whereClause = {
        createdAt: { [Op.between]: [start, end] }
      };

      if (roleName === 'customer') {
        whereClause.role = 'customer';
      } else {
        whereClause[Op.or] = isSqlite ? [
          { role: roleName },
          { roles: { [Op.like]: `%"${roleName}"%` } }
        ] : [
          { role: roleName },
          sequelize.where(sequelize.fn('JSON_CONTAINS', sequelize.col('roles'), sequelize.fn('JSON_QUOTE', roleName)), 1)
        ];
      }

      return User.count({ where: whereClause });
    };

    const [
      totalUsers,
      marketers,
      deliveryAgents,
      sellers,
      serviceProviders,
      customers,
      totalOrders,
      successfulOrders
    ] = await Promise.all([
      User.count({ where: { createdAt: { [Op.between]: [start, end] } } }),
      getRoleCount('marketer'),
      getRoleCount('delivery_agent'),
      getRoleCount('seller'),
      getRoleCount('service_provider'),
      getRoleCount('customer'),
      Order.count({ where: { createdAt: { [Op.between]: [start, end] } } }),
      Order.count({ 
        where: { 
          createdAt: { [Op.between]: [start, end] },
          status: { [Op.in]: ['completed', 'delivered'] }
        } 
      })
    ]);

    res.json({
      success: true,
      period,
      date,
      range: { start, end },
      data: {
        newUsers: totalUsers,
        roles: {
          marketers,
          deliveryAgents,
          sellers,
          serviceProviders,
          customers
        },
        orders: {
          total: totalOrders,
          successful: successfulOrders,
          successRate: totalOrders > 0 ? parseFloat(((successfulOrders / totalOrders) * 100).toFixed(2)) : 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching growth poster data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch growth data', error: error.message });
  }
};

module.exports = {
  getGeneralOverview,
  getHistoricalTrends,
  getRevenueForecast,
  getSellerPerformanceScores,
  getDeliveryEfficiencyMetrics,
  getMarketingCampaignROI,
  getGrowthPosterData
};
