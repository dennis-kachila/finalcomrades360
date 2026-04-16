const { Order } = require('./models/index');

async function listRecentOrders() {
    try {
        const orders = await Order.findAll({
            limit: 10,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'orderNumber', 'createdAt']
        });

        console.log('--- Recent Orders ---');
        orders.forEach(o => {
            console.log(`${o.createdAt.toISOString()} - ${o.orderNumber} (ID: ${o.id})`);
        });

    } catch (error) {
        console.error('Error listing orders:', error);
    } finally {
        process.exit();
    }
}

listRecentOrders();
