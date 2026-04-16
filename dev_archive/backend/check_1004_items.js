const { OrderItem, Product, FastFood, Order } = require('./models/index');
const { Op } = require('sequelize');

async function checkAllItemsToday(userId) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const items = await OrderItem.findAll({
            include: [
                { model: Product, required: false },
                { model: FastFood, required: false },
                { model: Order, required: true }
            ],
            where: {
                createdAt: { [Op.gte]: today },
                [Op.or]: [
                    { '$Product.sellerId$': userId },
                    { '$FastFood.vendor$': userId }
                ]
            }
        });

        console.log(`--- Items for Seller ${userId} today ---`);
        items.forEach(it => {
            console.log(`Item ID: ${it.id}, Name: ${it.name}, OrderID: ${it.orderId} (Seq: ${it.Order?.orderNumber})`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkAllItemsToday(1004);
