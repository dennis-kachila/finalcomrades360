const { Order, OrderItem, Product, FastFood, User } = require('./models/index');
const { Op } = require('sequelize');

async function debugOrder(orderPrefix) {
    try {
        const orders = await Order.findAll({
            where: {
                orderNumber: { [Op.like]: `${orderPrefix}%` }
            },
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

        if (orders.length === 0) {
            console.log(`No orders found with prefix ${orderPrefix}`);
            return;
        }

        for (const order of orders) {
            console.log('\n=========================================');
            console.log('--- Order Details ---');
            console.log(`ID: ${order.id}`);
            console.log(`Order Number: ${order.orderNumber}`);
            console.log(`Order SellerId: ${order.sellerId}`);
            console.log(`Status: ${order.status}`);

            console.log('\n--- Order Items ---');
            const sellers = new Set();
            for (const item of order.OrderItems) {
                const sellerId = item.Product?.sellerId || item.FastFood?.vendor;
                const sellerName = item.Product?.seller?.name || item.FastFood?.vendorDetail?.name;
                console.log(`Item ID: ${item.id}`);
                console.log(`  Product/Meal: ${item.Product?.name || item.FastFood?.name}`);
                console.log(`  Seller ID: ${sellerId}`);
                console.log(`  Seller Name: ${sellerName}`);
                if (sellerId) sellers.add(sellerId);
            }

            console.log('\n--- Sellers involved ---');
            for (const sid of sellers) {
                process.stdout.write(`Checking if OrderItem finds it for Seller ID ${sid}... `);
                const itemsFound = await OrderItem.findAll({
                    attributes: ['orderId'],
                    include: [
                        { model: Product, attributes: ['id', 'sellerId'], required: false },
                        { model: FastFood, attributes: ['id', 'vendor'], required: false }
                    ],
                    where: {
                        orderId: order.id,
                        [Op.or]: [
                            { '$Product.sellerId$': sid },
                            { '$FastFood.vendor$': sid }
                        ]
                    },
                    raw: true
                });
                console.log(`YES (${itemsFound.length} items)`);
            }
        }

    } catch (error) {
        console.error('Error debugging order:', error);
    } finally {
        process.exit();
    }
}

const orderNumPrefix = 'ORD-1772626179099-580';
debugOrder(orderNumPrefix);
