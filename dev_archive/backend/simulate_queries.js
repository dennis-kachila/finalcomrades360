const { Order, OrderItem, Product, FastFood, User, DeliveryTask, Warehouse, PickupStation } = require('./models/index');
const { Op } = require('sequelize');

const getSellersItemOrderIds = async (userId) => {
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
    return Array.from(new Set(items.map(it => it.orderId)));
};

async function simulateGetMyOrders(userId) {
    console.log(`\n--- Simulating getMyOrders for User ${userId} ---`);
    const myItemOrderIds = await getSellersItemOrderIds(userId);
    const orderWhere = {
        [Op.or]: [
            { sellerId: userId },
            { id: { [Op.in]: myItemOrderIds } }
        ]
    };

    const rows = await Order.findAll({
        where: orderWhere,
        order: [['createdAt', 'DESC']],
        include: [
            {
                model: OrderItem,
                as: 'OrderItems',
                include: [
                    {
                        model: Product,
                        required: false,
                        include: [{ model: User, as: 'seller', attributes: ['id', 'name'] }]
                    },
                    {
                        model: FastFood,
                        required: false,
                        include: [{ model: User, as: 'vendorDetail', attributes: ['id', 'name'] }]
                    }
                ]
            }
        ]
    });

    console.log(`Found ${rows.length} orders total for this seller.`);
    const target = rows.find(r => r.orderNumber.includes('1772626179099-580'));
    if (target) {
        console.log(`✅ Found target order: ${target.orderNumber} (ID: ${target.id})`);
        const items = target.OrderItems || [];
        const myItems = items.filter(it => {
            const isMyProduct = it.Product && String(it.Product.sellerId) === String(userId);
            const isMyMeal = it.FastFood && String(it.FastFood.vendor) === String(userId);
            return isMyProduct || isMyMeal;
        });
        console.log(`   It contains ${myItems.length} items for this seller.`);
    } else {
        console.log(`❌ Target order NOT found for this seller.`);
    }
}

async function run() {
    try {
        await simulateGetMyOrders(2);
        await simulateGetMyOrders(1004);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

run();
