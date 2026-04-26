const { User, Wallet, Transaction, PlatformConfig, sequelize } = require('../models');
const { calculateWithdrawalFee } = require('../utils/walletHelpers');

const getWallet = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get or create wallet
    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
    }

    // Get transactions
    const transactions = await Transaction.findAll({
      where: { userId, walletType: ['customer', null] }, // null fallback for legacy
      order: [['createdAt', 'DESC']]
    });

    res.json({
      balance: wallet.balance || 0,
      pendingBalance: wallet.pendingBalance || 0,
      successBalance: wallet.successBalance || 0,
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        description: tx.description || tx.note || 'Transaction',
        createdAt: tx.createdAt
      }))
    });
  } catch (error) {
    console.error('Error in getWallet:', error);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
};

const getUserWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = id;

    // Get or create wallet
    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
    }

    res.json({
      balance: wallet.balance || 0,
      pendingBalance: wallet.pendingBalance || 0,
      successBalance: wallet.successBalance || 0
    });
  } catch (error) {
    console.error('Error in getUserWallet:', error);
    res.status(500).json({ error: 'Failed to fetch user wallet' });
  }
};

const creditWallet = async (req, res) => {
  const { amount, note } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    let wallet = await Wallet.findOne({ 
      where: { userId }, 
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 }, { transaction: t });
    }

    await wallet.increment({ balance: amount }, { transaction: t });
    
    await Transaction.create({
      userId,
      amount,
      type: "credit",
      status: "completed",
      description: note || "Top-up",
      walletType: 'customer'
    }, { transaction: t });

    await t.commit();
    
    // Refresh wallet to get new balance
    await wallet.reload();
    res.json({ message: "Wallet credited", balance: wallet.balance });
  } catch (error) {
    await t.rollback();
    console.error('Error in creditWallet:', error);
    res.status(500).json({ error: 'Failed to credit wallet' });
  }
};

const withdraw = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { amount, paymentMethod, paymentDetails, paymentMeta } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role || 'customer';

    if (!amount || amount <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    // 0. Check User Status
    const user = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    
    if (user.isDeactivated || user.isSuspended) {
      await t.rollback();
      return res.status(403).json({ error: "Your account is suspended. Withdrawals are disabled." });
    }

    // 1. Get Wallet with LOCK
    let wallet = await Wallet.findOne({ 
      where: { userId }, 
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 }, { transaction: t });
    }

    if (wallet.balance < amount) {
      await t.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 2. Load Finance Settings
    let financeSettings = {};
    try {
      const configRecord = await PlatformConfig.findOne({ 
        where: { key: 'finance_settings' },
        transaction: t
      });
      if (configRecord) {
        financeSettings = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch finance settings:', err.message);
    }

    // 3. Validate Minimum Payout Threshold
    const thresholds = financeSettings.minPayout || {};
    const minAmount = thresholds[userRole] || 500; 
    if (amount < minAmount) {
      await t.rollback();
      return res.status(400).json({ error: `Minimum withdrawal amount for ${userRole.replace('_', ' ')} is KES ${minAmount}` });
    }

    // 4. Calculate Fee
    const fee = calculateWithdrawalFee(amount, financeSettings);
    const netAmount = Math.max(0, amount - fee);

    // 5. Determine Wallet Type
    let walletType = 'customer';
    const metaLabels = { nameKey: 'userName', role: userRole };

    if (userRole === 'seller') {
      walletType = 'seller';
      metaLabels.nameKey = 'sellerName';
    } else if (userRole === 'marketer') {
      walletType = 'marketer';
      metaLabels.nameKey = 'marketerName';
    } else if (userRole === 'delivery_agent') {
      walletType = 'delivery_agent';
      metaLabels.nameKey = 'agentName';
    } else if (userRole === 'service_provider') {
      walletType = 'service_provider';
      metaLabels.nameKey = 'providerName';
    }

    // 6. Build Metadata
    const metaObj = {
      method: paymentMethod || 'mpesa',
      details: paymentDetails || user.phone,
      [metaLabels.nameKey]: user.name,
      role: metaLabels.role,
      requestedAmount: amount,
      withdrawalFee: fee,
      netAmountToPay: netAmount,
      ...(paymentMeta || {})
    };

    // 7. Execute Withdrawal
    await wallet.decrement({ balance: amount }, { transaction: t });

    const tx = await Transaction.create({
      userId,
      amount,
      type: "debit",
      status: "pending",
      description: `Withdrawal Request (${paymentMethod === 'bank' ? 'Bank Transfer' : 'M-Pesa'})`,
      note: `${userRole.charAt(0).toUpperCase() + userRole.slice(1).replace('_', ' ')} requested payout of KES ${amount}. Fee: KES ${fee}. Net to Pay: KES ${netAmount}.`,
      metadata: JSON.stringify(metaObj),
      fee: fee,
      walletType: walletType
    }, { transaction: t });

    await t.commit();

    res.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      balance: wallet.balance - amount,
      fee,
      netAmount,
      transactionId: tx.id
    });

  } catch (error) {
    await t.rollback();
    console.error('Error in unified withdraw:', error);
    res.status(500).json({ error: 'Failed to process withdrawal request' });
  }
};

const withdrawFunds = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    const t = await sequelize.transaction();
    try {
        const wallet = await Wallet.findOne({ 
          where: { userId }, 
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        
        if (!wallet || wallet.balance < amount) {
            await t.rollback();
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        await wallet.decrement({ balance: amount }, { transaction: t });

        await Transaction.create({
            userId,
            amount,
            type: 'debit',
            status: 'completed',
            description: 'Withdrawal',
            walletType: 'customer'
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Withdrawal successful', balance: wallet.balance - amount });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ message: 'Error processing withdrawal' });
    }
};

const buyAirtime = async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: "Missing fields" });

  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const wallet = await Wallet.findOne({ 
      where: { userId }, 
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!wallet || wallet.balance < amount) {
      await t.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }

    await wallet.decrement({ balance: amount }, { transaction: t });
    
    await Transaction.create({
      userId,
      amount,
      type: "debit",
      status: "completed",
      description: `Airtime ${phone}`,
      walletType: 'customer'
    }, { transaction: t });

    await t.commit();
    res.json({ message: "Airtime purchase simulated", balance: wallet.balance - amount });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: "Failed to purchase airtime" });
  }
};

const handlePendingBalance = async (userId, amount) => {
    const t = await sequelize.transaction();
    try {
        const wallet = await Wallet.findOne({ 
          where: { userId }, 
          transaction: t,
          lock: t.LOCK.UPDATE 
        });
        if (!wallet || wallet.pendingBalance < amount) {
            throw new Error('Insufficient pending balance');
        }
        await wallet.decrement({ pendingBalance: amount }, { transaction: t });
        await t.commit();
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

const validatePayoutThreshold = async (role, amount) => {
    const config = await PlatformConfig.findOne({ where: { key: 'finance_settings' } });
    const thresholds = config ? JSON.parse(config.value).minPayout || {} : {};
    const minAmount = thresholds[role] || 0;
    if (amount < minAmount) {
        throw new Error(`Minimum payout for ${role} is ${minAmount}`);
    }
};

module.exports = {
  getWallet,
  getUserWallet,
  creditWallet,
  withdraw,
  withdrawFunds,
  buyAirtime,
  handlePendingBalance,
  validatePayoutThreshold
};
