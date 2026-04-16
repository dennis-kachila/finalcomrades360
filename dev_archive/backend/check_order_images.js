const { OrderItem, Product, FastFood, Order } = require('./models/index');

async function check() {
    try {
        const orders = await Order.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [
                        { model: Product },
                        { model: FastFood }
                    ]
                }
            ]
        });

        for (const order of orders) {
            console.log(`Order #${order.orderNumber} (ID: ${order.id})`);
            for (const item of order.OrderItems) {
                console.log(`  Item: ${item.name} (Type: ${item.itemType})`);
                if (item.Product) {
                    console.log(`    Product Cover: ${item.Product.coverImage}`);
                    console.log(`    Product Images: ${JSON.stringify(item.Product.images)}`);
                    console.log(`    Product Gallery: ${JSON.stringify(item.Product.galleryImages)}`);
                }
                if (item.FastFood) {
                    console.log(`    FastFood Main: ${item.FastFood.mainImage}`);
                }
            }
        }
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

check();
