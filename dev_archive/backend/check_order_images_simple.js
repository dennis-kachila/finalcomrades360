const { OrderItem, Product, FastFood, Order } = require('./models/index');

async function check() {
    try {
        const orders = await Order.findAll({
            limit: 3,
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{ model: Product }, { model: FastFood }]
                }
            ]
        });

        orders.forEach(o => {
            console.log('ORDER:', o.orderNumber);
            o.OrderItems.forEach(it => {
                const p = it.Product;
                const f = it.FastFood;
                console.log(`  ITEM: ${it.name} (ID: ${it.id}, ProdID: ${it.productId}, FoodID: ${it.fastFoodId}, Type: ${it.itemType})`);
                console.log(`    HasProduct: ${!!p}, HasFood: ${!!f}`);
                if (p) {
                    console.log(`    PROD_COVER: ${p.coverImage}`);
                }
                if (f) {
                    console.log(`    FOOD_MAIN: ${f.mainImage}`);
                }
            });
        });
    } catch (e) {
        console.error(e.message);
    } finally {
        process.exit();
    }
}

check();
