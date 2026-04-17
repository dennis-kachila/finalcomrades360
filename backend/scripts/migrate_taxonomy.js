const { sequelize } = require('../models');

async function migrate() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    
    console.log('--- MIGRATING CATEGORY TABLE ---');
    try {
      const { DataTypes } = require('sequelize');
      await queryInterface.addColumn('Category', 'taxonomyType', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'product'
      });
      console.log('✅ Added taxonomyType to Category');
    } catch (e) {
      console.log('⚠️ Category migration skipped (already exists or error):', e.message);
    }

    console.log('--- MIGRATING SUBCATEGORY TABLE ---');
    try {
      const { DataTypes } = require('sequelize');
      await queryInterface.addColumn('Subcategory', 'taxonomyType', {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'product'
      });
      console.log('✅ Added taxonomyType to Subcategory');
    } catch (e) {
      console.log('⚠️ Subcategory migration skipped (already exists or error):', e.message);
    }

    // Now populate them
    console.log('--- POPULATING TYPES ---');
    
    // Fast Food Keywords
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

    console.log('✅ Migration and population complete');
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
  }
  process.exit(0);
}

migrate();
