const { Category } = require('./models');

async function checkCategories() {
    try {
        const categories = await Category.findAll({
            where: { parentId: null }
        });
        console.log('Found ' + categories.length + ' root categories:');
        categories.forEach(c => {
            console.log('ID: ' + c.id + ', Name: ' + c.name);
        });
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkCategories();
