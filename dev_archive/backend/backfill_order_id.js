const { Transaction, Order } = require('./models');
const { Op } = require('sequelize');

async function backfill() {
    try {
        console.log('--- Starting Backfill for Transaction orderId ---');
        const transactions = await Transaction.findAll({
            where: {
                orderId: null,
                description: { [Op.like]: '%#ORD-%' }
            }
        });

        console.log(`Found ${transactions.length} transactions to potentially backfill.`);

        let updatedCount = 0;
        for (const tx of transactions) {
            const match = tx.description.match(/#ORD-([A-Z0-9]+)/i);
            if (match) {
                const orderNumber = match[1];
                // Searching for order with this number
                const order = await Order.findOne({ where: { orderNumber: { [Op.like]: `%${orderNumber}%` } } });
                if (order) {
                    await tx.update({ orderId: order.id });
                    updatedCount++;
                    console.log(`Updated Transaction ${tx.id} with Order ID ${order.id} (#${orderNumber})`);
                } else {
                    console.warn(`Could not find Order for #${orderNumber} referenced in Transaction ${tx.id}`);
                }
            }
        }

        console.log(`--- Backfill Complete. Total updated: ${updatedCount} ---`);
        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
}

backfill();
