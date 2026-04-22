const { sequelize } = require('./database/database');
const { QueryTypes } = require('sequelize');

async function migrate() {
  try {
    console.log('🚀 Starting Database Migration...');

    // 1. Check if deletedAt exists in User table
    const tableInfo = await sequelize.query("PRAGMA table_info(User);", { type: QueryTypes.SELECT });
    const hasDeletedAt = tableInfo.some(column => column.name === 'deletedAt');

    if (!hasDeletedAt) {
      console.log('➕ Adding deletedAt column to User table...');
      await sequelize.query("ALTER TABLE User ADD COLUMN deletedAt DATETIME DEFAULT NULL;");
      console.log('✅ Column added successfully.');
    } else {
      console.log('ℹ️ deletedAt column already exists in User table.');
    }

    console.log('✨ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
