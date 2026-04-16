const { FastFood } = require('./models');

async function debug() {
    try {
        const items = await FastFood.findAll({
            limit: 10,
            attributes: ['id', 'name', 'mainImage']
        });

        console.log('--- FAST FOOD IMAGES ---');
        items.forEach(item => {
            console.log(`${item.name} (ID: ${item.id}): ${item.mainImage}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

debug();
