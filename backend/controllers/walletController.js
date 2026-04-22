const { User, Wallet, Transaction, PlatformConfig } = require('../models');
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
      where: { userId, walletType: 'customer' },
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

  const u = await User.findByPk(req.user.id);
  const wallet = await Wallet.findOne({ where: { userId: u.id } });

  await wallet.increment({ balance: amount });
  await Transaction.create({
    userId: u.id,
    amount,
    type: "credit",
    status: "completed",
    description: note || "Top-up",
    walletType: 'customer'
  });

  res.json({ message: "Wallet credited", balance: (wallet.balance || 0) + amount });
};

const withdraw = async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDetails, paymentMeta } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role || 'customer';

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    // 1. Get or Create Wallet
    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 2. Load Finance Settings
    let financeSettings = {};
    try {
      const configRecord = await PlatformConfig.findOne({ where: { key: 'finance_settings' } });
      if (configRecord) {
        financeSettings = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch finance settings:', err.message);
    }

    // 3. Validate Minimum Payout Threshold
    const thresholds = financeSettings.minPayout || {};
    const minAmount = thresholds[userRole] || 500; // default to 500
    if (amount < minAmount) {
      return res.status(400).json({ error: `Minimum withdrawal amount for ${userRole.replace('_', ' ')} is KES ${minAmount}` });
    }

    // 4. Calculate Fee
    const fee = calculateWithdrawalFee(amount, financeSettings);
    const netAmount = Math.max(0, amount - fee);

    // 5. Determine Wallet Type and Metadata Labels based on Role
    let walletType = 'customer';
    const metaLabels = {
      nameKey: 'userName',
      role: userRole
    };

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
      details: paymentDetails || req.user.phone,
      [metaLabels.nameKey]: req.user.name,
      role: metaLabels.role,
      requestedAmount: amount,
      withdrawalFee: fee,
      netAmountToPay: netAmount,
      ...(paymentMeta || {})
    };

    // 7. Execute Withdrawal (Transaction)
    // Subtract full amount from balance (lock the funds)
    await wallet.decrement({ balance: amount });

    const transaction = await Transaction.create({
      userId,
      amount,
      type: "debit",
      status: "pending",
      description: `Withdrawal Request (${paymentMethod === 'bank' ? 'Bank Transfer' : 'M-Pesa'})`,
      note: `${userRole.charAt(0).toUpperCase() + userRole.slice(1).replace('_', ' ')} requested payout of KES ${amount}. Fee: KES ${fee}. Net to Pay: KES ${netAmount}.`,
      metadata: JSON.stringify(metaObj),
      fee: fee,
      walletType: walletType
    });

    res.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      balance: (wallet.balance || 0) - amount,
      fee,
      netAmount,
      transactionId: transaction.id
    });

  } catch (error) {
    console.error('Error in unified withdraw:', error);
    res.status(500).json({ error: 'Failed to process withdrawal request', message: error.message });
  }
};

const withdrawFunds = async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    try {
        const wallet = await Wallet.findOne({ where: { userId } });
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Deduct from balance
        await wallet.decrement({ balance: amount });

        // Record transaction
        await Transaction.create({
            userId,
            amount,
            type: 'debit',
            status: 'completed',
            description: 'Withdrawal',
            walletType: 'customer'
        });

        res.json({ message: 'Withdrawal successful', balance: wallet.balance - amount });
    } catch (error) {
        res.status(500).json({ message: 'Error processing withdrawal', error: error.message });
    }
};

const buyAirtime = async (req, res) => {
  const { phone, amount } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: "Missing fields" });

  const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "Insufficient balance" });

  await wallet.decrement({ balance: amount });
  await Transaction.create({
    userId: req.user.id,
    amount,
    type: "debit",
    status: "completed",
    description: `Airtime ${phone}`,
    walletType: 'customer'
  });

  res.json({ message: "Airtime purchase simulated", balance: (wallet.balance || 0) - amount });
};

const handlePendingBalance = async (userId, amount) => {
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || wallet.pendingBalance < amount) {
        throw new Error('Insufficient pending balance');
    }
    await wallet.decrement({ pendingBalance: amount });
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
