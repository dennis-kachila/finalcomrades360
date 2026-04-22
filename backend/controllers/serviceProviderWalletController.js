const { Wallet, Transaction } = require('../models');

const getServiceProviderWallet = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get or create wallet
        let wallet = await Wallet.findOne({ where: { userId } });
        if (!wallet) {
            wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
        }

        // Get transactions
        const transactions = await Transaction.findAll({
            where: { userId, walletType: 'service_provider' },
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
                description: tx.description || tx.note || 'Service Provider Transaction',
                createdAt: tx.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching service provider wallet:', error);
        res.status(500).json({ error: 'Failed to fetch wallet data' });
    }
};

module.exports = {
    getServiceProviderWallet
};
