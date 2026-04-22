
const { sequelize } = require('../database/database');
const { DataTypes } = require('sequelize');

async function syncUserTable() {
  console.log('[Sync] Starting User table column check...');
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    const tableInfo = await queryInterface.describeTable('User');
    const columns = Object.keys(tableInfo);
    
    const requiredColumns = [
      { name: 'roles', type: 'JSON', defaultValue: '[]' },
      { name: 'suspendedRoles', type: 'JSON', defaultValue: '[]' },
      { name: 'isDeactivated', type: 'TINYINT(1)', defaultValue: '0' },
      { name: 'isFrozen', type: 'TINYINT(1)', defaultValue: '0' },
      { name: 'mustChangePassword', type: 'TINYINT(1)', defaultValue: '0' },
      { name: 'dashboardPassword', type: 'VARCHAR(255)', defaultValue: 'NULL' },
      { name: 'twoFactorEnabled', type: 'TINYINT(1)', defaultValue: '0' },
      { name: 'profileImage', type: 'VARCHAR(255)', defaultValue: 'NULL' },
      { name: 'nationalIdNumber', type: 'VARCHAR(255)', defaultValue: 'NULL' },
      { name: 'nationalIdUrl', type: 'TEXT', defaultValue: 'NULL' },
      { name: 'nationalIdStatus', type: "ENUM('none', 'pending', 'approved', 'rejected')", defaultValue: "'none'" }
    ];

    for (const col of requiredColumns) {
      if (!columns.includes(col.name)) {
        console.log(`[Sync] Adding missing column: ${col.name}...`);
        try {
          // Construct raw SQL for more control over ENUMs and types
          let sql = `ALTER TABLE User ADD COLUMN ${col.name} ${col.type}`;
          if (col.defaultValue !== 'NULL' && col.type !== 'JSON') {
            sql += ` DEFAULT ${col.defaultValue}`;
          }
          
          await sequelize.query(sql);
          console.log(`✅ [Sync] Successfully added ${col.name}`);
        } catch (addErr) {
          console.error(`❌ [Sync] Failed to add ${col.name}:`, addErr.message);
        }
      } else {
        console.log(`[Sync] Column ${col.name} already exists.`);
      }
    }

    console.log('✅ [Sync] User table synchronization complete.');
  } catch (err) {
    console.error('❌ [Sync] Fatal error during sync:', err.message);
  } finally {
    await sequelize.close();
  }
}

syncUserTable();
