const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

// Load .env to get database path if needed
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  env.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim();
  });
}

const dbPath = path.join(__dirname, '../backend/database.sqlite');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: console.log
});

async function migrate() {
  try {
    console.log('--- Starting Role Suspension Migration ---');

    // 1. Add the new column
    const tableInfo = await sequelize.getQueryInterface().describeTable('User');
    if (!tableInfo.suspendedRoles) {
      console.log('Adding "suspendedRoles" column to User table...');
      await sequelize.getQueryInterface().addColumn('User', 'suspendedRoles', {
        type: DataTypes.TEXT, // SQLite stores JSON as TEXT
        defaultValue: '[]'
      });
    } else {
      console.log('"suspendedRoles" column already exists.');
    }

    // 2. Migrate data
    console.log('Migrating existing suspension flags...');
    const [users] = await sequelize.query('SELECT id, isMarketerSuspended, isSellerSuspended, isDeliverySuspended, suspendedRoles FROM User');
    
    for (const user of users) {
      let suspensions = [];
      try {
        suspensions = user.suspendedRoles ? JSON.parse(user.suspendedRoles) : [];
      } catch (e) {
        suspensions = [];
      }

      if (user.isMarketerSuspended && !suspensions.includes('marketer')) suspensions.push('marketer');
      if (user.isSellerSuspended && !suspensions.includes('seller')) suspensions.push('seller');
      if (user.isDeliverySuspended && !suspensions.includes('delivery_agent')) suspensions.push('delivery_agent');

      if (suspensions.length > 0) {
        console.log(`Updating user ${user.id} with suspensions: ${JSON.stringify(suspensions)}`);
        await sequelize.query(
          'UPDATE User SET suspendedRoles = ? WHERE id = ?',
          { replacements: [JSON.stringify(suspensions), user.id] }
        );
      }
    }

    console.log('--- Migration Completed Successfully ---');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
