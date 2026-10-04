/**
 * Database Configuration with connection pooling and retry logic
 * @version 2.0.0
 */

const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../utils/logger');

// Get database configuration
const dbConfig = config.DATABASE;

// Build connection string or use individual parameters
let sequelize;

try {
  if (process.env.DATABASE_URL) {
    // Use connection string if provided
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: dbConfig.dialect,
      logging: dbConfig.logging ? (msg) => logger.debug(msg) : false,
      pool: dbConfig.pool,
      define: dbConfig.define,
      dialectOptions: dbConfig.ssl ? {
        ssl: {
          require: true,
          rejectUnauthorized: dbConfig.sslRejectUnauthorized,
        },
      } : {},
      retry: dbConfig.retry,
      timezone: dbConfig.timezone,
    });
  } else {
    // Use individual parameters
    sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: dbConfig.logging ? (msg) => logger.debug(msg) : false,
        pool: dbConfig.pool,
        define: dbConfig.define,
        dialectOptions: dbConfig.ssl ? {
          ssl: {
            require: true,
            rejectUnauthorized: dbConfig.sslRejectUnauthorized,
          },
        } : {},
        retry: dbConfig.retry,
        timezone: dbConfig.timezone,
      }
    );
  }

  // Test connection function
  const testConnection = async () => {
    try {
      await sequelize.authenticate();
      logger.info('✅ Database connection established successfully');
      logger.info(`📊 Database: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`);
      return true;
    } catch (error) {
      logger.error('❌ Unable to connect to database:', error.message);
      throw error;
    }
  };

  // Sync database (development only)
  const syncDatabase = async (force = false, alter = false) => {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Database sync is disabled in production');
      return false;
    }

    try {
      await sequelize.sync({ force, alter });
      logger.info(`✅ Database synced (force: ${force}, alter: ${alter})`);
      return true;
    } catch (error) {
      logger.error('❌ Database sync failed:', error.message);
      throw error;
    }
  };

  module.exports = {
    sequelize,
    testConnection,
    syncDatabase,
    config: dbConfig,
    isRemote: dbConfig.host !== 'localhost' && dbConfig.host !== '127.0.0.1',
  };

} catch (error) {
  logger.error('❌ Failed to initialize Sequelize:', error.message);
  throw error;
}