const { Order, OrderItem, FastFood, Product } = require('./models');
const { Op } = require('sequelize');

async function listTodayOrders() {
    try {
        const today = new Date('2026-03-04T00:00:00Z');
        const orders = await Order.findAll({
            where: {
                createdAt: { [Op.gte]: today }
            },
            include: [
                { model: OrderItem, as: 'OrderItems' }
            ]
        });

        console.log(`FOUND ${orders.length} ORDERS`);
        orders.forEach(o => {
            console.log(`ORDER ID: ${o.id}, NUMBER: ${o.orderNumber}, TOTAL: ${o.total}, STATUS: ${o.status}`);
            console.log(`  ITEM COUNT: ${o.OrderItems ? o.OrderItems.length : 'NULL'}`);
        });

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        process.exit();
    }
}

listTodayOrders();
