const { Order, OrderItem, FastFood, Product, User } = require('./models');

async function debugOrder205() {
    try {
        const orderId = 205;
        const order = await Order.findOne({
            where: { id: orderId },
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

        if (!order) {
            console.log('ORDER 205 NOT FOUND');
            process.exit(1);
        }

        console.log('--- ORDER 205 ---');
        console.log('ID:', order.id);
        console.log('OrderNumber:', order.orderNumber);
        console.log('ItemCount:', order.OrderItems.length);

        order.OrderItems.forEach((item, idx) => {
            console.log(`Item ${idx}:`);
            console.log(`  ID: ${item.id}`);
            console.log(`  Name: ${item.name}`);
            console.log(`  ItemType: ${item.itemType}`);
            console.log(`  ProductId: ${item.productId}`);
            console.log(`  FastFoodId: ${item.fastFoodId}`);
            console.log(`  Product: ${item.Product ? 'YES' : 'NO'}`);
            console.log(`  FastFood: ${item.FastFood ? 'YES' : 'NO'}`);
            if (item.FastFood) {
                console.log(`  FastFood Name: ${item.FastFood.name}`);
                console.log(`  FastFood Image: ${item.FastFood.mainImage}`);
            }
        });

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        process.exit();
    }
}

debugOrder205();
