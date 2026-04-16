const { sequelize } = require('../database/database');

async function patch() {
  try {
    console.log('🚀 Patching Transaction table to add "fee" column...');
    
    // Check if column already exists
    const [results] = await sequelize.query("PRAGMA table_info('Transaction')");
    const hasFee = results.some(column => column.name === 'fee');
    
    if (hasFee) {
      console.log('✅ "fee" column already exists.');
    } else {
      await sequelize.query('ALTER TABLE "Transaction" ADD COLUMN fee FLOAT DEFAULT 0;');
      console.log('✅ "fee" column added successfully.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error patching database:', error);
    process.exit(1);
  }
}

patch();
