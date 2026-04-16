const { FastFood } = require('./models');

async function checkItems() {
    try {
        const items = await FastFood.findAll({
            where: { id: [32, 42] }
        });
        console.log('--- Items 32 & 42 ---');
        items.forEach(item => {
            console.log(`ID: ${item.id}, Name: ${item.name}`);
        });
        console.log('----------------------');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItems();
