const { Order, OrderItem, Product, FastFood, User } = require('./models/index');

async function inspectOrder33() {
    try {
        const order = await Order.findByPk(33, {
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

        if (!order) return;
        console.log(`Order 33 Number: ${order.orderNumber}, SellerId: ${order.sellerId}`);
        order.OrderItems.forEach(it => {
            const itemSellerId = it.Product?.sellerId || it.FastFood?.vendor;
            console.log(`  - Item: ${it.name}, ItemSeller: ${itemSellerId}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

inspectOrder33();
