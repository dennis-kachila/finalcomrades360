const { sequelize, Sequelize } = require('../database/database');

async function disableMaintenance() {
  try {
    console.log('🔄 Attempting to disable maintenance mode in database...');
    
    // Check if the PlatformConfigs table exists
    const [results] = await sequelize.query("SELECT * FROM PlatformConfigs WHERE `key` = 'maintenance_settings'");
    
    if (results.length === 0) {
      console.log('ℹ️ No maintenance_settings found in database. Nothing to disable.');
      process.exit(0);
    }

    const currentSettings = typeof results[0].value === 'string' ? JSON.parse(results[0].value) : results[0].value;
    console.log('📊 Current Settings:', currentSettings);

    if (currentSettings.enabled === false) {
      console.log('✅ Maintenance mode is ALREADY disabled.');
    } else {
      const newSettings = { ...currentSettings, enabled: false };
      const now = new Date().toISOString();
      
      await sequelize.query(
        "UPDATE PlatformConfigs SET value = ?, updatedAt = ? WHERE `key` = 'maintenance_settings'",
        {
          replacements: [JSON.stringify(newSettings), now]
        }
      );
      console.log('🚀 SUCCESS: Maintenance mode disabled.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error disabling maintenance mode:', error.message);
    process.exit(1);
  }
}

disableMaintenance();
