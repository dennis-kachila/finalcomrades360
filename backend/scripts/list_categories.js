const { Category } = require('../models');

async function listCategories() {
  try {
    const categories = await Category.findAll({
      attributes: ['id', 'name', 'taxonomyType']
    });
    
    console.log('--- ALL CATEGORIES ---');
    categories.forEach(c => {
      console.log(`ID: ${c.id}, Name: ${c.name}, Current Type: ${c.taxonomyType}`);
    });
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

listCategories();
