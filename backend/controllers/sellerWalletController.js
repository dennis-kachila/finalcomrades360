const { Wallet, Transaction } = require('../models');

const getSellerWallet = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get or create wallet
        let wallet = await Wallet.findOne({ where: { userId } });
        if (!wallet) {
            wallet = await Wallet.create({ userId, balance: 0, pendingBalance: 0, successBalance: 0 });
        }

        // Get transactions with order details
        const transactions = await Transaction.findAll({
            where: { userId, walletType: 'seller' },
            include: [
                {
                    model: require('../models').Order,
                    as: 'order',
                    attributes: ['id', 'orderNumber', 'status', 'createdAt'],
                    include: [
                        {
                            model: require('../models').OrderItem,
                            as: 'OrderItems',
                            attributes: ['id', 'name', 'quantity', 'price', 'basePrice', 'total', 'itemType']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({
            balance: wallet.balance || 0,
            pendingBalance: wallet.pendingBalance || 0,
            successBalance: wallet.successBalance || 0,
            transactions: transactions.map(tx => {
                const txData = {
                    id: tx.id,
                    amount: tx.amount,
                    type: tx.type,
                    status: tx.status,
                    description: tx.description || tx.note || 'Seller Transaction',
                    createdAt: tx.createdAt,
                    orderId: tx.orderId
                };

                // Add order details if available
                if (tx.order) {
                    txData.orderNumber = tx.order.orderNumber;
                    txData.orderItems = tx.order.OrderItems.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        basePrice: item.basePrice || item.price // Fallback to price for old orders
                    }));
                    // Summarize items for the list view
                    txData.itemSummary = txData.orderItems
                        .map(item => `${item.name} x${item.quantity}`)
                        .join(', ');
                }

                return txData;
            })
        });
    } catch (error) {
        console.error('Error fetching seller wallet:', error);
        res.status(500).json({ error: 'Failed to fetch wallet data' });
    }
};

module.exports = {
    getSellerWallet
};
