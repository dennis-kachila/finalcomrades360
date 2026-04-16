const { Order, User, Warehouse, PickupStation, DeliveryAgentProfile } = require('./models');
const { Op } = require('sequelize');

async function test() {
    try {
        const orderId = 234; // from user log
        const order = await Order.findByPk(orderId, {
            include: [
                { model: User, as: 'seller' },
                { model: Warehouse, as: 'Warehouse' },
                { model: PickupStation, as: 'PickupStation' }
            ]
        });
        if (!order) {
            console.log("Order 234 not found, trying another one");
            const anyOrder = await Order.findOne();
            if (!anyOrder) return console.log("No orders in DB");
            // call test again with anyOrder.id?
            return;
        }
        console.log("Found Order:", order.orderNumber);

        const agents = await User.findAll({
            where: { role: 'delivery_agent' },
            include: [{ model: DeliveryAgentProfile, as: 'deliveryProfile' }]
        });
        console.log(`Found ${agents.length} agents`);

    } catch (err) {
        console.error("TEST_ERROR", err);
    } finally {
        process.exit();
    }
}

test();
