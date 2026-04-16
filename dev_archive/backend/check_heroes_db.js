const { FastFood } = require('./models');
const { Op } = require('sequelize');

async function checkHeroes() {
    try {
        const items = await FastFood.findAll({
            where: {
                [Op.or]: [
                    { name: { [Op.like]: '%Hero%' } },
                    { description: { [Op.like]: '%Hero%' } },
                    { shortDescription: { [Op.like]: '%Hero%' } }
                ]
            }
        });
        console.log('--- Items with "Hero" ---');
        items.forEach(item => {
            console.log(`ID: ${item.id}, Name: ${item.name}, isFeatured: ${item.isFeatured}`);
        });
        console.log('-------------------------');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkHeroes();
