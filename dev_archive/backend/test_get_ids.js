const { Order, OrderItem, Product, FastFood, User } = require('./models/index');
const { Op } = require('sequelize');

async function testGetSellersItemOrderIds(userId) {
    console.log(`\n--- Testing getSellersItemOrderIds for User ${userId} ---`);
    const items = await OrderItem.findAll({
        attributes: ['orderId'],
        include: [
            { model: Product, attributes: ['id', 'sellerId'], required: false },
            { model: FastFood, attributes: ['id', 'vendor'], required: false }
        ],
        where: {
            [Op.or]: [
                { '$Product.sellerId$': userId },
                { '$FastFood.vendor$': userId }
            ]
        },
        raw: true
    });

    console.log('Raw results (first 2):', JSON.stringify(items.slice(0, 2), null, 2));
    const orderIds = Array.from(new Set(items.map(it => it.orderId)));
    console.log('Extracted Order IDs:', orderIds);
    return orderIds;
}

async function run() {
    try {
        await testGetSellersItemOrderIds(2);
        await testGetSellersItemOrderIds(1004);
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

run();
