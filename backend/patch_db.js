const { sequelize } = require('./models');

async function patchDatabase() {
  console.log('🚀 Starting Production Database Patch...');
  const queryInterface = sequelize.getQueryInterface();

  const addColumnSafely = async (tableName, columnName, definition) => {
    try {
      await queryInterface.addColumn(tableName, columnName, definition);
      console.log(`✅ Column '${columnName}' added successfully to '${tableName}'.`);
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log(`⚠️ Column '${columnName}' already exists in '${tableName}'. Skipping...`);
      } else {
        console.error(`❌ Error adding column '${columnName}' to '${tableName}':`, error.message);
        throw error;
      }
    }
  };

  try {
    const { DataTypes } = require('sequelize');

    // 1. Add taxonomyType to Category
    await addColumnSafely('Category', 'taxonomyType', {
      type: DataTypes.ENUM('product', 'service', 'fast_food'),
      allowNull: false,
      defaultValue: 'product'
    });

    // 2. Add taxonomyType to Subcategory
    await addColumnSafely('Subcategory', 'taxonomyType', {
      type: DataTypes.ENUM('product', 'service', 'fast_food'),
      allowNull: false,
      defaultValue: 'product'
    });

    // 3. Populate types based on keywords
    console.log('🔄 Populating taxonomy types...');
    
    // Fast Food Keywords (Higher priority/Specific)
    const foodKeywords = ['food', 'drink', 'beverage', 'restaurant', 'cafe', 'meal', 'cuisine', 'dining', 'burger', 'pizza', 'sandwich', 'salad', 'soup'];
    for (const keyword of foodKeywords) {
      await sequelize.query(`UPDATE Category SET taxonomyType = 'fast_food' WHERE LOWER(name) LIKE '%${keyword}%'`);
      await sequelize.query(`UPDATE Subcategory SET taxonomyType = 'fast_food' WHERE LOWER(name) LIKE '%${keyword}%'`);
    }

    // Services Keywords
    const serviceKeywords = ['service', 'repair', 'maintenance', 'cleaning', 'tutoring', 'consulting', 'plumbing', 'electrical', 'carpentry', 'painting', 'support'];
    for (const keyword of serviceKeywords) {
      await sequelize.query(`UPDATE Category SET taxonomyType = 'service' WHERE LOWER(name) LIKE '%${keyword}%' AND taxonomyType != 'fast_food'`);
      await sequelize.query(`UPDATE Subcategory SET taxonomyType = 'service' WHERE LOWER(name) LIKE '%${keyword}%' AND taxonomyType != 'fast_food'`);
    }

    console.log('✨ Database patch completed successfully!');
  } catch (error) {
    console.error('💥 Critical failure during database patch:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

patchDatabase();
