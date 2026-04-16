const { Order, OrderItem, Product, User, FastFood, DeliveryTask, Warehouse, PickupStation } = require('./models');
const { Op } = require('sequelize');

async function debug() {
    try {
        const item = await OrderItem.findOne({
            where: { id: 80 },
            include: [{ model: Product }]
        });

        if (!item) {
            console.log('OrderItem 80 not found');
            return;
        }

        console.log('--- OrderItem 80 ---');
        console.log('orderId:', item.orderId);
        console.log('productId:', item.productId);
        console.log('Product exists:', !!item.Product);
        if (item.Product) {
            console.log('sellerId:', item.Product.sellerId);
        }

        const order = await Order.findOne({
            where: { id: item.orderId },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [
                        { model: Product }
                    ]
                }
            ]
        });

        if (order) {
            console.log('--- Order Structure ---');
            const json = order.toJSON();
            const firstItem = json.OrderItems.find(it => it.id === 80);
            console.log('OrderItem with ID 80 in Order response:');
            console.log(JSON.stringify(firstItem, (key, value) => {
                if (typeof value === 'string' && value.startsWith('data:image')) return value.substring(0, 50) + '...';
                return value;
            }, 2));
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

debug();
