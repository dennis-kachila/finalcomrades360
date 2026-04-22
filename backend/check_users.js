const { sequelize } = require('./database/database');
const { QueryTypes } = require('sequelize');

async function check() {
  try {
    const users = await sequelize.query("SELECT id, name, email, isDeactivated, deletedAt FROM User WHERE deletedAt IS NOT NULL OR isDeactivated = 1 LIMIT 5", { type: QueryTypes.SELECT });
    console.log('--- Archived/Deactivated Users ---');
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check();
