const { Wallet, Transaction } = require('../models');

const getMarketerWallet = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get or create wallet
        let wallet = await Wallet.findOne({ where: { userId } });
        if (!wallet) {
            wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
        }

        // Get transactions
        const transactions = await Transaction.findAll({
            where: { userId, walletType: 'marketer' },
            order: [['createdAt', 'DESC']]
        });

        // Get min payout threshold for marketers
        let minPayout = 500; // default
        try {
            const { PlatformConfig } = require('../models');
            const configRecord = await PlatformConfig.findOne({ where: { key: 'finance_settings' } });
            if (configRecord) {
                const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
                minPayout = (dbConfig.minPayout || {})['marketer'] || 500;
            }
        } catch (e) { /* use default */ }

        res.json({
            balance: wallet.balance || 0,
            pendingBalance: wallet.pendingBalance || 0,
            successBalance: wallet.successBalance || 0,
            minPayout,
            transactions: transactions.map(tx => ({
                id: tx.id,
                amount: tx.amount,
                type: tx.type,
                status: tx.status,
                description: tx.description || tx.note || 'Marketer Transaction',
                createdAt: tx.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching marketer wallet:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wallet data [V3-STALE-CHECK]',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

module.exports = {
    getMarketerWallet
};
