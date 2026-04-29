const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables with robust path detection
const envPaths = [
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '.env')
];

// Load primary .env
envPaths.forEach(envPath => {
  if (fs.existsSync(envPath)) {
    // Use override: true to ensure local .env wins over OS environment variables
    dotenv.config({ path: envPath, override: true });
  }
});

// Now determine environment after loading .env
const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// Force process.env.NODE_ENV to be consistent with our detection
process.env.NODE_ENV = env;

// ONLY load .env.production if we are explicitly in production mode
if (env === 'production') {
  const prodEnvPaths = [
    path.resolve(__dirname, '..', '..', '.env.production'),
    path.resolve(__dirname, '..', '.env.production'),
    path.resolve(__dirname, '.env.production')
  ];
  prodEnvPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
    }
  });
}

console.log(`[Database] Final Operating Mode: ${env}`);

// Database configuration
const config = {
  development: {
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || path.join(__dirname, '..', 'database.sqlite'),
    logging: process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false,
    dialectOptions: {
      mode: 2 | 4 // OPEN_READWRITE | OPEN_CREATE
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true,
    },
    pool: {
      max: 10,
      min: 2,
      acquire: 60000,
      idle: 10000,
    },
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql', // Explicitly force mysql for production config
    logging: process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 25, // Increased from 10 to 25 to prevent pool exhaustion in production
      min: 2,
      acquire: 60000,
      idle: 20000,
    },
    dialectOptions: process.env.DB_SSL === 'true' ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    } : {},
  },
};

const dbConfig = config[env];
if (dbConfig.dialect === 'sqlite') {
  console.log(`[Database] SQLite Storage Path: ${dbConfig.storage}`);
}

// Initialize Sequelize
const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  ...dbConfig,
  benchmark: env === 'development',
  retry: {
    max: 3,
    timeout: 90000,
  },
});

// Enable WAL mode (Only for SQLite)
sequelize.afterConnect(async (connection) => {
  if (dbConfig.dialect !== 'sqlite') return;

  try {
    if (connection.run) {
      connection.run('PRAGMA journal_mode=WAL;');
      connection.run('PRAGMA synchronous=NORMAL;');
      connection.run('PRAGMA temp_store=MEMORY;');
      connection.run('PRAGMA cache_size=-64000;');
      connection.run('PRAGMA mmap_size=268435456;');
    } else if (connection.execute) {
      await connection.execute('PRAGMA journal_mode=WAL;');
      await connection.execute('PRAGMA synchronous=NORMAL;');
      await connection.execute('PRAGMA temp_store=MEMORY;');
      await connection.execute('PRAGMA cache_size=-64000;');
      await connection.execute('PRAGMA mmap_size=268435456;');
    }
    console.log('✅ SQLite WAL Mode Enabled');
  } catch (err) {
    console.warn('⚠️ Could not enable WAL mode:', err.message);
  }
});

// Test the database connection and sync models
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.error(`✅ Database connected successfully (${dbConfig.dialect})`);

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && process.env.DB_SYNC !== 'true') {
      console.error('ℹ️ Skipping auto-sync (Production mode).');
    } else if (isProd || process.env.DB_SYNC === 'true') {
      console.error('🔄 Synchronizing database models...');
      await sequelize.sync({ force: false, alter: false });
    }

    // Self-healing: Enforce default roles
    try {
      const Role = sequelize.models.Role || sequelize.define('Role', { 
        id: { type: Sequelize.STRING, primaryKey: true },
        name: Sequelize.STRING,
        isSystem: { type: Sequelize.BOOLEAN, defaultValue: true }
      });

      const defaultRoles = [
        { id: 'seller', name: 'Seller' },
        { id: 'admin', name: 'Admin' },
        { id: 'super_admin', name: 'Super Admin' },
        { id: 'delivery_agent', name: 'Delivery Agent' },
        { id: 'marketer', name: 'Marketer' },
        { id: 'service_provider', name: 'Service Provider' },
      ];

      for (const r of defaultRoles) {
        // Use findOrCreate to be safe across dialects (SQLite/MySQL)
        await sequelize.query(`
          INSERT INTO Roles (id, name, isSystem, permissions, accessLevels, createdAt, updatedAt)
          SELECT * FROM (SELECT '${r.id}' AS rid, '${r.name}' AS rname, 1 AS rsys, '[]' AS rperm, '{}' AS rlvl, NOW() AS rca, NOW() AS rua) AS tmp
          WHERE NOT EXISTS (
              SELECT id FROM Roles WHERE id = '${r.id}'
          ) LIMIT 1;
        `.replace(/NOW\(\)/g, dbConfig.dialect === 'sqlite' ? "datetime('now')" : "NOW()")
         .replace('OR IGNORE', '') // Cleanup any legacy attempts
        );
      }
      console.error('✅ Default roles verified/seeded.');
    } catch (roleErr) {
      console.warn('⚠️ Warning: Could not seed roles:', roleErr.message);
    }

    // Self-healing: Enforce default platform configs
    try {
      const defaultConfigs = [
        { 
          key: 'platform_settings', 
          value: JSON.stringify({
            siteName: 'Comrades360',
            siteDescription: 'Your trusted marketplace',
            contactEmail: 'admin@comrades360.com',
            supportPhone: '+254700000000',
            currency: 'KES',
            timezone: 'Africa/Nairobi'
          })
        },
        {
          key: 'mpesa_config',
          value: JSON.stringify({
            consumerKey: process.env.MPESA_CONSUMER_KEY || '',
            consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
            passkey: process.env.MPESA_PASSKEY || '',
            shortcode: process.env.MPESA_SHORTCODE || '174379',
            stkTimeout: 60,
            mockMode: process.env.MPESA_MOCK_MODE === 'true'
          })
        },
        {
          key: 'mpesa_manual_instructions',
          value: JSON.stringify({ paybill: '714888', accountNumber: '223052' })
        },
        {
          key: 'airtel_config',
          value: JSON.stringify({
            clientId: process.env.AIRTEL_CLIENT_ID || '',
            clientSecret: process.env.AIRTEL_CLIENT_SECRET || '',
            callbackUrl: process.env.AIRTEL_CALLBACK_URL || ''
          })
        },
        {
          key: 'sms_config',
          value: JSON.stringify({
            username: process.env.AFRICASTALKING_USERNAME || '',
            apiKey: process.env.AFRICASTALKING_API_KEY || '',
            provider: 'africastalking'
          })
        },
        {
          key: 'whatsapp_config',
          value: JSON.stringify({ 
            method: 'cloud', // Default to stable Cloud method
            metaAccessToken: '',
            metaPhoneNumberId: '',
            templates: {
              orderPlaced: 'Hi {name}, your order #{orderNumber} has been received! Total: KES {total}.',
              orderInTransit: 'Good news! Your order #{orderNumber} has been collected by {agentName} and is in transit. 🚚',
              orderReadyPickup: 'Your order #{orderNumber} is ready for collection at {stationName}! 📦',
              orderDelivered: 'Hi {name}, your order #{orderNumber} has been delivered. Thank you!',
              deliveryUpdate: 'Hello, your order #{orderNumber} status has been updated to: {status}. {message}',
              agentArrived: 'Your delivery agent {agentName} has arrived at your location! 📍 Please meet them to collect order #{orderNumber}.',
              agentTaskAssigned: 'You have been assigned a new delivery task for order #{orderNumber}. Type: {deliveryType}',
              agentTaskReassigned: 'A delivery task for order #{orderNumber} has been reassigned to you.',
              adminTaskRejected: 'Delivery agent {agentName} rejected task for order #{orderNumber}. Reason: {reason}',
              phoneVerification: 'Your Comrades360 verification OTP is {otp}. It expires in 10 minutes.\n\n@comrades360.shop #{otp}',
              registrationOtp: 'Your Comrades360 registration code is: {otp}. It expires in {minutes} minutes.\n\n@comrades360.shop #{otp}',
              guestCheckoutOtp: 'Your Comrades360 guest checkout code is: {otp}. Valid for 10 minutes.\n\n@comrades360.shop #{otp}',
              passwordReset: 'Your Comrades360 password reset code is {otp}. It expires in {minutes} minutes.\n\n@comrades360.shop #{otp}',
              securityChangeOtp: 'Your Comrades360 security change OTP is {otp}. It expires in 10 minutes.\n\n@comrades360.shop #{otp}',
              withdrawalStatus: 'Your withdrawal of KES {amount} has been processed successfully! 💰'
            },
            channels: {
              passwordReset: { whatsapp: false, sms: true, email: true, in_app: false }
            }
          })
        },
        {
          key: 'finance_settings',
          value: JSON.stringify({
            referralSplit: { primary: 0.6, secondary: 0.4 },
            minPayout: { 
              seller: 1000, 
              marketer: 500, 
              delivery_agent: 200,
              station_manager: 500,
              warehouse_manager: 1000,
              service_provider: 500
            }

          })
        },
        {
          key: 'logistic_settings',
          value: JSON.stringify({
            warehouseHours: { open: '08:00', close: '20:00' },
            autoCancelUnpaidHours: 24,
            deliveryFeeBuffer: 0,
            autoApproveRequests: false,
            autoDispatchOrders: false
          })
        },
        {
          key: 'security_settings',
          value: JSON.stringify({
            sessionTimeout: 30,
            passwordMinLength: 8,
            twoFactorEnabled: false,
            loginAttempts: 5,
            ipWhitelist: []
          })
        },
        {
          key: 'notification_settings',
          value: JSON.stringify({
            emailNotifications: true,
            smsNotifications: true,
            pushNotifications: false,
            orderConfirmations: true,
            deliveryUpdates: true
          })
        },
        {
          key: 'seo_settings',
          value: JSON.stringify({
            title: 'Comrades360 | University Marketplace',
            description: 'The #1 marketplace for university students in Kenya.',
            keywords: 'university, marketplace, students, kenya, electronics, fashion, food',
            socialLinks: {
              facebook: 'https://facebook.com/comrades360',
              instagram: 'https://instagram.com/comrades360',
              twitter: 'https://twitter.com/comrades360'
            }
          })
        },
        {
          key: 'maintenance_settings',
          value: JSON.stringify({
            enabled: false,
            message: 'Comrades360 is currently undergoing scheduled maintenance. We will be back shortly!'
          })
        },
        {
          key: 'system_env',
          value: JSON.stringify({
            server: {
              port: process.env.PORT || 4000,
              nodeEnv: process.env.NODE_ENV || 'development',
              baseUrl: process.env.BASE_URL || 'http://localhost:4000',
              apiUrl: '/api'
            },
            app: {
              frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
              supportEmail: 'support@comrades360.com'
            },
            database: {
              dialect: 'sqlite',
              storage: './database.sqlite'
            }
          })
        }
      ];

      for (const cfg of defaultConfigs) {
        const [config] = await sequelize.query(
          "SELECT `key` FROM PlatformConfig WHERE `key` = '" + cfg.key + "' LIMIT 1"
        );
        if (config.length === 0) {
          const now = new Date().toISOString();
          await sequelize.query(
            "INSERT INTO PlatformConfig (`key`, value, createdAt, updatedAt) VALUES ('" + 
            cfg.key + "', '" + cfg.value.replace(/'/g, "''") + "', '" + now + "', '" + now + "')"
          );
          console.log(`🌱 Seeded default config: ${cfg.key}`);
        }
      }
    } catch (configErr) {
      console.warn('⚠️ Warning: Could not seed platform configs:', configErr.message);
    }


  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
};

// Export the database connection and Sequelize constructor
module.exports = {
  sequelize,
  Sequelize,
  testConnection,
};
