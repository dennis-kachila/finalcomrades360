const { Order, OrderItem, Product, FastFood, User } = require('./models/index');

async function checkGroupItems(groupId) {
    try {
        const orders = await Order.findAll({
            where: { checkoutGroupId: groupId },
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

        console.log(`--- Items for Group ${groupId} ---`);
        for (const order of orders) {
            console.log(`Order ID: ${order.id}, Num: ${order.orderNumber}, SellerId: ${order.sellerId}`);
            for (const it of order.OrderItems) {
                const itemSellerId = it.Product?.sellerId || it.FastFood?.vendor;
                console.log(`  - Item: ${it.name}, ItemType: ${it.itemType}, ProductID: ${it.productId}, FastFoodID: ${it.fastFoodId}, ItemSeller: ${itemSellerId}`);
            }
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkGroupItems('GRP-1772626179099-224');
