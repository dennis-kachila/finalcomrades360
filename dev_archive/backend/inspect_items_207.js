const { OrderItem, Product, FastFood } = require('./models/index');

async function inspectItems(orderId) {
    try {
        const items = await OrderItem.findAll({
            where: { orderId },
            include: [
                { model: Product, required: false },
                { model: FastFood, required: false }
            ]
        });

        console.log(`--- Items for Order ${orderId} ---`);
        items.forEach(it => {
            console.log(`ID: ${it.id}, Name: ${it.name}, Type: ${it.itemType}`);
            console.log(`  productId: ${it.productId}, fastFoodId: ${it.fastFoodId}`);
            if (it.Product) {
                console.log(`  Product sellerId: ${it.Product.sellerId}`);
            } else {
                console.log(`  Product: NULL`);
            }
            if (it.FastFood) {
                console.log(`  FastFood vendor: ${it.FastFood.vendor}`);
            } else {
                console.log(`  FastFood: NULL`);
            }
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

inspectItems(207);
