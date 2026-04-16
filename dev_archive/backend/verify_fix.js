const { Order, OrderItem, Product, FastFood, User } = require('./models/index');
const { Op } = require('sequelize');

// Copy logic from sellerController.js to verify it works in isolation
const getSellersItemOrderIds = async (userId) => {
    try {
        const [pIds, fIds] = await Promise.all([
            Product.findAll({ where: { sellerId: userId }, attributes: ['id'], raw: true }).then(rows => rows.map(r => r.id)),
            FastFood.findAll({ where: { vendor: userId }, attributes: ['id'], raw: true }).then(rows => rows.map(r => r.id))
        ]);

        if (pIds.length === 0 && fIds.length === 0) return [];

        const items = await OrderItem.findAll({
            attributes: ['orderId'],
            where: {
                [Op.or]: [
                    { productId: { [Op.in]: pIds } },
                    { fastFoodId: { [Op.in]: fIds } }
                ]
            },
            raw: true
        });

        return Array.from(new Set(items.map(it => it.orderId)));
    } catch (err) {
        console.error('[getSellersItemOrderIds] Error:', err);
        return [];
    }
};

async function verify() {
    console.log('--- Verification Start ---');

    // Test Seller 1004 (Josephine Wambutsi)
    const userId = 1004;
    console.log(`Testing for Seller ${userId}...`);

    const orderIds = await getSellersItemOrderIds(userId);
    console.log('Retrieved Order IDs:', orderIds);

    if (orderIds.includes(207)) {
        console.log('✅ SUCCESS: Order 207 found for Seller 1004!');
    } else {
        console.error('❌ FAILURE: Order 207 NOT found for Seller 1004.');
    }

    // Test Seller 2 (Evellah Wambutsi)
    const seller2Id = 2;
    console.log(`Testing for Seller ${seller2Id}...`);
    const s2OrderIds = await getSellersItemOrderIds(seller2Id);
    console.log('Retrieved Order IDs:', s2OrderIds);
    if (s2OrderIds.includes(206)) {
        console.log('✅ SUCCESS: Order 206 found for Seller 2!');
    } else {
        console.error('❌ FAILURE: Order 206 NOT found for Seller 2.');
    }

    console.log('--- Verification End ---');
    process.exit(0);
}

verify().catch(err => {
    console.error('Verification failed with error:', err);
    process.exit(1);
});
