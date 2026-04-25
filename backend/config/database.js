require('dotenv').config();

// Query performance logging function
const queryLogger = (sql) => {
  if (process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true') {
    console.time(`[DB] ${sql.substring(0, 60)}`);
  }
};

module.exports = {
  development: {
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || './database.sqlite',
    logging: process.env.LOG_QUERIES === 'true' ? queryLogger : false, // Enable with LOG_QUERIES=true
    // SQLite specific options
    define: {
      timestamps: true,
      underscored: true
    },
    // Connection pool for better concurrency
    pool: {
      max: 5,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    username: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASS || '',
    database: process.env.TEST_DB_NAME || 'comrades360_test',
    host: process.env.TEST_DB_HOST || '127.0.0.1',
    dialect: process.env.TEST_DB_DIALECT || 'sqlite',
    storage: 'C:\\Users\\user\\Desktop\\comrades360-vite-main\\backend\\test-database.sqlite',
    logging: false
  },
  production: {
    username: process.env.PROD_DB_USER || process.env.DB_USER,
    password: process.env.PROD_DB_PASS || process.env.DB_PASS,
    database: process.env.PROD_DB_NAME || process.env.DB_NAME,
    host: process.env.PROD_DB_HOST || process.env.DB_HOST,
    dialect: process.env.PROD_DB_DIALECT || process.env.DB_DIALECT || 'mysql',
    logging: false,
    // Connection pool for production
    pool: {
      max: 10,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: process.env.DB_SSL === 'true',
        rejectUnauthorized: false
      }
    }
  }
};
