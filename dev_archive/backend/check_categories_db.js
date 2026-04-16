const { Category, Subcategory } = require('./models');

async function checkCategories() {
    try {
        const categories = await Category.findAll();
        const subcategories = await Subcategory.findAll();
        
        console.log('--- Categories ---');
        categories.forEach(c => console.log(`ID: ${c.id}, Name: ${c.name}`));
        
        console.log('\n--- Subcategories ---');
        subcategories.forEach(s => console.log(`ID: ${s.id}, Name: ${s.name}, Parent: ${s.categoryId}`));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkCategories();
