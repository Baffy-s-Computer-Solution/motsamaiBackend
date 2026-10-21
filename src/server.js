const http = require('http');
const app = require('../app');
const config = require('./config');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const { connectRedis, redisClient } = require('./config/redis');
const { initializeSocket } = require('./realtime/socket');
const { syncAllFirebaseUsersToFirestore } = require('./services/firestoreUserService');
const { syncPendingRiderRecords } = require('./services/firestoreRiderRecordService');
const { isFirestoreFirebaseEnabled } = require('./config/firebase');

const server = http.createServer(app);
const io = initializeSocket(server);
app.set('io', io);
let riderRecordSyncTimer;

const logEndpointCatalog = () => {
  const endpointGroups = [
    '/api/v1/auth',
    '/api/v1/users',
    '/api/v1/rides',
    '/api/v1/rider',
    '/api/v1/passenger-bookings',
    '/api/v1/drivers',
    '/api/v1/payments',
    '/api/v1/admin',
    '/api/v1/analytics',
    '/api/v1/fleet',
    '/api/v1/geofences',
    '/api/v1/health',
    '/api/v1/incidents',
    '/api/v1/notifications',
    '/api/v1/promotions',
    '/api/v1/reports',
    '/api/v1/reviews',
    '/api/v1/support',
    '/api/v1/uploads',
    '/api/v1/webhooks',
    '/api/v1/zones',
    '/api/v1/verification',
  ];

  logger.info('Backend endpoint catalog:');
  endpointGroups.forEach((endpoint) => logger.info(`  ${endpoint}`));
};

const startRiderRecordSync = () => {
  if (!isFirestoreFirebaseEnabled || process.env.RIDER_RECORD_SYNC_ENABLED === 'false') return;

  const configuredInterval = Number(process.env.RIDER_RECORD_SYNC_INTERVAL_MS || 60000);
  const interval = Number.isInteger(configuredInterval) && configuredInterval >= 10000
    ? configuredInterval
    : 60000;
  let inProgress = false;

  const synchronize = async () => {
    if (inProgress) return;
    inProgress = true;
    try {
      const result = await syncPendingRiderRecords();
      if (result.synced) logger.info(result, 'Firestore rider records synchronized to PostgreSQL');
    } catch (error) {
      logger.error({ error: error.message }, 'Firestore rider-record synchronization failed');
    } finally {
      inProgress = false;
    }
  };

  riderRecordSyncTimer = setInterval(synchronize, interval);
  riderRecordSyncTimer.unref();
  void synchronize();
};

const ensureDatabaseSchema = async () => {
  if (!config.DATABASE.sync) {
    return;
  }

  logger.info(
    `Database schema auto-sync enabled (alter: ${config.DATABASE.syncAlter}, force: false)`
  );

  await sequelize.sync({
    alter: config.DATABASE.syncAlter,
    force: false,
  });

  logger.info('Database schema is ready');
};

server.timeout = config.SERVER_TIMEOUT;
server.keepAliveTimeout = config.KEEP_ALIVE_TIMEOUT;
server.headersTimeout = config.HEADERS_TIMEOUT;
server.maxHeadersCount = config.MAX_HEADERS_COUNT;

const startServer = async () => {
  server.listen(config.PORT, config.HOST, () => {
    logger.info(`${config.APP_NAME} listening on ${config.HOST}:${config.PORT}`);
    logEndpointCatalog();
  });
  startRiderRecordSync();

  try {
    if (config.SKIP_DB_CHECK) {
      logger.warn('Skipping database startup check because SKIP_DB_CHECK=true');
    } else {
      await sequelize.authenticate();
      logger.info('Database connection established');
    }

    await ensureDatabaseSchema();
    try {
      const result = await syncAllFirebaseUsersToFirestore();
      if (result.synced) logger.info({ count: result.synced }, 'Firebase Auth users synchronized to Firestore');
    } catch (error) {
      logger.warn({ error: error.message }, 'Firebase Auth to Firestore backfill failed');
    }

    if (config.REDIS_URL) {
      await connectRedis();
    }
  } catch (error) {
    logger.error('Startup dependency check failed; server remains online:', error);
  }
};

const shutdown = async (signal) => {
  logger.info(`${signal} received; shutting down`);
  if (riderRecordSyncTimer) clearInterval(riderRecordSyncTimer);

  server.close(async () => {
    try {
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
      }
      await sequelize.close();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown failed:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

startServer();

module.exports = server;
module.exports.io = io;
module.exports.startRiderRecordSync = startRiderRecordSync;
