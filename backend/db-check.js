const { sequelize } = require('./database/database');
const path = require('path');

async function checkDatabaseSchema() {
  console.log('--- Database Schema Diagnostic ---');
  try {
    await sequelize.authenticate();
    console.log('✅ Connection to database established.');

    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    console.log('Tables found:', tables);

    if (!tables.includes('User')) {
      console.error('❌ Table "User" not found!');
      return;
    }

    console.log('\n--- Checking Table: User ---');
    const columns = await queryInterface.describeTable('User');
    const columnNames = Object.keys(columns);
    console.log('Columns in production:', columnNames.join(', '));

    // List of columns expected by the current model (based on User.js)
    const expectedColumns = [
      'id', 'name', 'email', 'phone', 'password', 'role', 'roles', 
      'isVerified', 'applicationStatus', 'isDeactivated', 'isFrozen',
      'lastLogin', 'walletBalance', 'mustChangePassword', 'referralCode'
    ];

    const missingColumns = expectedColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.error('❌ MISSING COLUMNS:', missingColumns.join(', '));
      console.log('\nSuggested SQL to fix:');
      missingColumns.forEach(col => {
        let type = 'VARCHAR(255)';
        if (col === 'roles') type = 'JSON';
        if (col.startsWith('is') || col === 'mustChangePassword') type = 'TINYINT(1) DEFAULT 0';
        if (col === 'walletBalance') type = 'DECIMAL(10,2) DEFAULT 0.00';
        console.log(`ALTER TABLE User ADD COLUMN ${col} ${type};`);
      });
    } else {
      console.log('✅ All critical User columns are present.');
    }

    console.log('\n--- Checking Table: PlatformConfig ---');
    if (tables.includes('PlatformConfig')) {
      const configCols = await queryInterface.describeTable('PlatformConfig');
      console.log('PlatformConfig columns:', Object.keys(configCols).join(', '));
    } else {
      console.warn('⚠️ PlatformConfig table missing.');
    }

  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

checkDatabaseSchema();
