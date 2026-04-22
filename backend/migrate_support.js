const { sequelize } = require('./database/database');

async function migrate() {
  try {
    console.log('🚀 Syncing SupportMessages table...');
    const SupportMessage = require('./models/SupportMessage')(sequelize, require('sequelize').DataTypes);
    await SupportMessage.sync({ alter: true });
    console.log('✅ SupportMessages table synchronized.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
