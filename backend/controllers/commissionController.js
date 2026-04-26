const { Commission, Order, OrderItem, User, Product, FastFood, Service, ReferralTracking } = require('../models');
const { calculateItemCommission } = require('../utils/commissionUtils');
const { Op } = require('sequelize');
const { creditPending } = require('../utils/walletHelpers');

// Admin: get all commissions with optional filters
const getAllCommissions = async (req, res) => {
  try {
    const { status, marketerId, from, to, limit = 100, offset = 0, orderNumber } = req.query;
    const where = {};
    if (status) where.status = status;
    if (marketerId) where.marketerId = Number(marketerId);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const orderInclude = { model: Order, attributes: ['orderNumber', 'createdAt'] };
    if (orderNumber) {
      orderInclude.where = { orderNumber: { [Op.like]: `%${orderNumber}%` } };
    }

    const { count, rows } = await Commission.findAndCountAll({
      where,
      include: [
        { model: User, as: 'marketer', attributes: ['id', 'name', 'email', 'referralCode'] },
        orderInclude,
        { model: Product, attributes: ['name'], required: false },
        { model: FastFood, attributes: ['name'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
    });

    const totalPending = await Commission.sum('commissionAmount', { where: { status: 'pending' } }) || 0;
    const totalPaid = await Commission.sum('commissionAmount', { where: { status: 'paid' } }) || 0;

    res.json({ commissions: rows, total: count, totalPending, totalPaid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin/Finance: bulk pay all pending commissions for a single marketer (or all)
const bulkPayCommissions = async (req, res) => {
  try {
    const { marketerId } = req.body;
    const where = { status: 'pending' };
    if (marketerId) where.marketerId = Number(marketerId);

    const pending = await Commission.findAll({ where });
    if (pending.length === 0) {
      return res.json({ message: 'No pending commissions to pay.', count: 0 });
    }

    await Commission.update(
      { status: 'paid', paidAt: new Date() },
      { where }
    );

    res.json({ message: `${pending.length} commission(s) marked as paid.`, count: pending.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Calculate commission when order is completed
// Supports dual referral system:
// - Primary referral (checkout): 60% of commission
// - Secondary referral (registration): 40% of commission
// - If only one exists: 100% of commission
const calculateCommission = async (orderId, primaryReferralCode = null, secondaryReferralCode = null, options = {}) => {
  const transaction = options.transaction || null;

  try {
    const order = await Order.findByPk(orderId, {
      include: [{
        model: OrderItem,
        as: 'OrderItems',
        include: [
          { model: Product },
          { model: FastFood },
          { model: Service }
        ]
      }],
      transaction
    });

    if (!order) {
      console.warn('⚠️  Order not found for commission calculation:', orderId);
      return false;
    }

    // Fallback to referral codes saved on the order if not explicitly provided
    if (!primaryReferralCode) primaryReferralCode = order.primaryReferralCode;
    if (!secondaryReferralCode) secondaryReferralCode = order.secondaryReferralCode;

    // If no referral codes at all, no commission to calculate
    if (!primaryReferralCode && !secondaryReferralCode) {
      console.log('ℹ️  No referral codes for order:', orderId);
      return false;
    }

    console.log('💰 Calculating commission for order:', orderId);
    console.log('  Resolved Referral Codes:');
    console.log('  - Primary (Arg):', primaryReferralCode || 'null');
    console.log('  - Secondary (Arg):', secondaryReferralCode || 'null');
    console.log('  - Order DB Primary:', order.primaryReferralCode);
    console.log('  - Order DB Secondary:', order.secondaryReferralCode);

    // Find marketers for both referral codes
    let primaryMarketer = null;
    let secondaryMarketer = null;

    if (primaryReferralCode) {
      primaryMarketer = await User.findOne({
        where: { referralCode: primaryReferralCode },
        transaction
      });
      if (!primaryMarketer) {
        console.warn('⚠️  Primary referral code not found or user is not a marketer:', primaryReferralCode);
      }
    }

    if (secondaryReferralCode) {
      secondaryMarketer = await User.findOne({
        where: { referralCode: secondaryReferralCode },
        transaction
      });
      if (!secondaryMarketer) {
        console.warn('⚠️  Secondary referral code not found or user is not a marketer:', secondaryReferralCode);
      }
    }

    // If no valid marketers found, return
    if (!primaryMarketer && !secondaryMarketer) {
      console.warn('⚠️  No valid marketers found for referral codes');
      return false;
    }

    console.log('  Marketers Found:');
    console.log(`  - Primary: ${primaryMarketer ? primaryMarketer.id : 'None'} (Code: ${primaryReferralCode})`);
    console.log(`  - Secondary: ${secondaryMarketer ? secondaryMarketer.id : 'None'} (Code: ${secondaryReferralCode})`);

    // Determine commission split
    let primarySplit = 0.6; // Default fallback
    let secondarySplit = 0.4; // Default fallback

    try {
      const { PlatformConfig } = require('../models');
      const configRecord = await PlatformConfig.findOne({ where: { key: 'finance_settings' } });
      if (configRecord) {
        const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
        if (dbConfig.referralSplit) {
          primarySplit = dbConfig.referralSplit.primary || 0.6;
          secondarySplit = dbConfig.referralSplit.secondary || 0.4;
        }
      }
    } catch (err) {
      console.warn('⚠️  Could not load finance settings from DB, using fallback splits:', err.message);
    }

    if (primaryMarketer && secondaryMarketer) {
      // Both codes exist
      if (primaryMarketer.id === secondaryMarketer.id) {
        // Same marketer for both - give 100% to avoid double payment
        primarySplit = 1.0;
        secondarySplit = 0;
        console.log('ℹ️  Same marketer for both codes, awarding 100% to primary');
      } else {
        // Different marketers - dynamic split
        console.log(`💰 Dual referral: Primary ${primarySplit * 100}%, Secondary ${secondarySplit * 100}%`);
      }
    } else if (primaryMarketer) {

      // Only primary code
      primarySplit = 1.0;
      console.log('💰 Primary referral only: 100%');
    } else if (secondaryMarketer) {
      // Only secondary code
      secondarySplit = 1.0;
      console.log('💰 Secondary referral only: 100%');
    }

    // Calculate commission for each item in the order
    for (const item of (order.OrderItems || [])) {
      const itemDetails = item.Product || item.FastFood || item.Service;

      if (!itemDetails) {
        console.warn(`⚠️ Item ID ${item.id} has no associated Product or FastFood record.`);
        continue;
      }

      // Check if marketing is enabled for this product/item
      if (!itemDetails.marketingEnabled) {
        console.log(`ℹ️ Marketing not enabled for item: ${itemDetails.name}`);
        continue;
      }

      const price = Number(item.price || 0);
      const quantity = item.quantity || 0;
      const marketingCommission = Number(itemDetails.marketingCommission || 0);
      const marketingCommissionType = itemDetails.marketingCommissionType || 'percentage';

      if (marketingCommission <= 0) {
        console.warn(`⚠️ Item ${itemDetails.name} (ID: ${itemDetails.id}) has 0 or missing marketing commission.`);
        continue;
      }

      const totalCommissionAmount = calculateItemCommission(itemDetails, price, quantity);

      console.log(`  - Item: ${itemDetails.name}, Sale: ${price * quantity}, Type: ${itemDetails.marketingCommissionType}, Total Commission: ${totalCommissionAmount}`);

      // Create commission record for primary marketer
      if (primaryMarketer && primarySplit > 0) {
        const existingPrimary = await Commission.findOne({
          where: {
            orderId: order.id,
            marketerId: primaryMarketer.id,
            productId: item.productId || null,
            fastFoodId: item.fastFoodId || null,
            serviceId: item.serviceId || null
          },
          transaction
        });

        if (!existingPrimary) {
          const primaryCommission = totalCommissionAmount * primarySplit;
          await Commission.create({
            marketerId: primaryMarketer.id,
            orderId: order.id,
            productId: item.productId || null,
            fastFoodId: item.fastFoodId || null,
            serviceId: item.serviceId || null,
            saleAmount: price * quantity,
            commissionRate: marketingCommission,
            commissionAmount: primaryCommission,
            referralCode: primaryReferralCode,
            status: 'pending',
            commissionType: secondaryMarketer && secondarySplit > 0 ? 'primary_60' : 'full_100',
            pricingMethod: marketingCommissionType
          }, { transaction });
          console.log(`    ✅ Primary commission: ${primaryCommission} (${primarySplit * 100}%)`);

          // Wallet Credit
          await creditPending(
            primaryMarketer.id,
            primaryCommission,
            `Commission Earning for Order #${order.orderNumber} (Pending Clearance)`,
            order.id,
            transaction,
            'marketer'
          );
        } else {
          console.log(`    ℹ️ Primary commission already exists for Marketer ${primaryMarketer.id}. Skipping.`);
        }
      }

      // Create commission record for secondary marketer
      if (secondaryMarketer && secondarySplit > 0) {
        const existingSecondary = await Commission.findOne({
          where: {
            orderId: order.id,
            marketerId: secondaryMarketer.id,
            productId: item.productId || null,
            fastFoodId: item.fastFoodId || null,
            serviceId: item.serviceId || null
          },
          transaction
        });

        if (!existingSecondary) {
          const secondaryCommission = totalCommissionAmount * secondarySplit;
          await Commission.create({
            marketerId: secondaryMarketer.id,
            orderId: order.id,
            productId: item.productId || null,
            fastFoodId: item.fastFoodId || null,
            serviceId: item.serviceId || null,
            saleAmount: price * quantity,
            commissionRate: marketingCommission,
            commissionAmount: secondaryCommission,
            referralCode: secondaryReferralCode,
            status: 'pending',
            commissionType: primaryMarketer && primarySplit > 0 ? 'secondary_40' : 'full_100',
            pricingMethod: marketingCommissionType
          }, { transaction });
          console.log(`    ✅ Secondary commission: ${secondaryCommission} (${secondarySplit * 100}%)`);

          // Wallet Credit
          await creditPending(
            secondaryMarketer.id,
            secondaryCommission,
            `Commission Earning for Order #${order.orderNumber} (Pending Clearance)`,
            order.id,
            transaction,
            'marketer'
          );
        } else {
          console.log(`    ℹ️ Secondary commission already exists for Marketer ${secondaryMarketer.id}. Skipping.`);
        }
      }

      // Update referral tracking with conversion
      if (primaryReferralCode) {
        await ReferralTracking.update(
          { convertedAt: new Date(), orderId: order.id },
          {
            where: {
              referralCode: primaryReferralCode,
              [Op.or]: [
                { productId: item.productId || -1 },
                { fastFoodId: item.fastFoodId || -1 },
                { serviceId: item.serviceId || -1 }
              ],
              orderId: null
            },
            transaction
          }
        );
      }
      if (secondaryReferralCode) {
        await ReferralTracking.update(
          { convertedAt: new Date(), orderId: order.id },
          {
            where: {
              referralCode: secondaryReferralCode,
              [Op.or]: [
                { productId: item.productId || -1 },
                { fastFoodId: item.fastFoodId || -1 },
                { serviceId: item.serviceId || -1 }
              ],
              orderId: null
            },
            transaction
          }
        );
      }
    }

    console.log('✅ Commission calculation completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Commission calculation error:', error);
    return false;
  }
};

// Get marketer's commission history
const getCommissionHistory = async (req, res) => {
  try {
    const marketerId = req.user?.id || req.user?.userId;

    const commissions = await Commission.findAll({
      where: { marketerId },
      include: [
        { model: Product, attributes: ['name', 'coverImage', 'galleryImages'] },
        { model: Order, attributes: ['orderNumber', 'createdAt'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    const totalEarnings = commissions.reduce((sum, comm) => sum + comm.commissionAmount, 0);
    const pendingEarnings = commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, comm) => sum + comm.commissionAmount, 0);

    res.json({
      commissions,
      totalEarnings,
      pendingEarnings,
      paidEarnings: totalEarnings - pendingEarnings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Pay commission to marketer (admin only)
const payCommission = async (req, res) => {
  try {
    const { commissionId } = req.params;

    const commission = await Commission.findByPk(commissionId, {
      include: [{ model: User, as: 'marketer' }]
    });

    if (!commission) {
      return res.status(404).json({ error: 'Commission not found' });
    }

    if (commission.status === 'paid') {
      return res.status(400).json({ error: 'Commission already paid' });
    }

    // Update commission status
    await commission.update({
      status: 'paid',
      paidAt: new Date()
    });

    res.json({ message: 'Commission paid successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  calculateCommission,
  getCommissionHistory,
  payCommission,
  getAllCommissions,
  bulkPayCommissions
};
