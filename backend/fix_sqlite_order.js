const { sequelize } = require('./models');
const { QueryTypes } = require('sequelize');

async function fixOrderTable() {
  try {
    const dialect = sequelize.getDialect();
    if (dialect !== 'sqlite') {
      console.log('Skipping SQLite fix because dialect is:', dialect);
      return;
    }

    console.log('🛠️ Attempting to fix Order table userId nullability for SQLite...');
    
    // Disable foreign key checks temporarily
    await sequelize.query('PRAGMA foreign_keys = OFF');
    
    // Check if table is 'Order' or 'Orders'
    const tables = await sequelize.getQueryInterface().showAllTables();
    const tableName = tables.find(t => ['Order', 'Orders'].includes(t)) || 'Order';
    console.log(`Targeting table: ${tableName}`);

    // Describe the table to see current columns
    const columns = await sequelize.getQueryInterface().describeTable(tableName);
    
    if (columns.userId && columns.userId.allowNull) {
      console.log('✅ userId is already nullable.');
    } else {
      console.log('🔄 Recreating table to allow NULL on userId...');
      
      // In SQLite, we have to recreate the table to change nullability
      // But we can try the shortcut first (though it often doesn't work for NOT NULL)
      // Actually, standard way is:
      // 1. Create new table with correct schema
      // 2. Copy data
      // 3. Drop old table
      // 4. Rename new table
      
      // For simplicity and safety in this environment, let's try a direct query first
      // although SQLite usually rejects ALTER TABLE MODIFY
      try {
        await sequelize.query(`UPDATE \`${tableName}\` SET userId = NULL WHERE userId = 0`);
      } catch (e) {}

      // Let's use the QueryInterface to change the column, but with FKs OFF
      await sequelize.getQueryInterface().changeColumn(tableName, 'userId', {
        type: require('sequelize').INTEGER,
        allowNull: true
      });
      console.log('✅ Successfully changed userId column to nullable.');
    }

    // Re-enable foreign key checks
    await sequelize.query('PRAGMA foreign_keys = ON');
    console.log('🚀 Done.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing Order table:', error);
    process.exit(1);
  }
}

fixOrderTable();
