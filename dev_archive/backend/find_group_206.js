const { Order, OrderItem, Product, FastFood, User } = require('./models/index');

async function findGroup(orderId) {
    try {
        const o = await Order.findByPk(orderId);
        if (!o) return;
        console.log(`Order ${orderId} has checkoutGroupId: ${o.checkoutGroupId}`);

        const allOrders = await Order.findAll({
            where: { checkoutGroupId: o.checkoutGroupId },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [
                        { model: Product, required: false },
                        { model: FastFood, required: false }
                    ]
                }
            ]
        });

        console.log(`--- All orders in group ${o.checkoutGroupId} ---`);
        allOrders.forEach(order => {
            console.log(`Order ${order.id} (${order.orderNumber}), SellerId: ${order.sellerId}`);
            order.OrderItems.forEach(it => {
                const itemSellerId = it.Product?.sellerId || it.FastFood?.vendor;
                console.log(`  - Item: ${it.name}, ItemSeller: ${itemSellerId}`);
            });
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

findGroup(206);
