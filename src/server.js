const http = require('http');
const app = require('../app');
const config = require('./config');
const logger = require('./utils/logger');
const { sequelize, User } = require('./models');
const { connectRedis, redisClient } = require('./config/redis');
const { initializeSocket } = require('./realtime/socket');
const { syncAllFirebaseUsersToFirestore } = require('./services/firestoreUserService');

const server = http.createServer(app);
const io = initializeSocket(server);
app.set('io', io);

const logEndpointCatalog = () => {
  const endpointGroups = [
    '/api/v1/auth',
    '/api/v1/users',
    '/api/v1/rides',
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

const ensureAdminUser = async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD is missing; startup admin bootstrap skipped');
    return;
  }

  const [firstName, ...lastNameParts] = (process.env.ADMIN_NAME || 'Motsamai Admin').trim().split(/\s+/);
  const phone = process.env.ADMIN_PHONE || `+266${String(Date.now()).slice(-8)}`;
  const existing = await User.findOne({ where: { email }, paranoid: false });

  if (existing) {
    if (existing.deletedAt && typeof existing.restore === 'function') {
      await existing.restore();
    }

    await existing.update({
      role: 'admin',
      is_active: true,
      is_verified: true,
      password_hash: password,
    });
    logger.info({ email }, 'Admin user verified from environment');
    return;
  }

  await User.create({
    email,
    phone,
    first_name: firstName || 'Motsamai',
    last_name: lastNameParts.join(' ') || 'Admin',
    password_hash: password,
    role: 'admin',
    is_active: true,
    is_verified: true,
    email_verified_at: new Date(),
  });

  logger.info({ email }, 'Admin user created from environment');
};

const ensureCynthiaAdmin = async () => {
  const email = (process.env.CYNTHIA_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    logger.warn('CYNTHIA_ADMIN_EMAIL is missing; Cynthia admin bootstrap skipped');
    return;
  }

  const existing = await User.findOne({ where: { email }, paranoid: false });
  if (!existing) {
    logger.info({ email }, 'Cynthia admin will be initialized on first login');
    return;
  }

  if (existing.deletedAt && typeof existing.restore === 'function') {
    await existing.restore();
  }

  await existing.update({
    role: 'admin',
    is_active: true,
    is_verified: true,
  });
  logger.info({ email }, 'Cynthia admin verified from environment');
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

  try {
    if (config.SKIP_DB_CHECK) {
      logger.warn('Skipping database startup check because SKIP_DB_CHECK=true');
    } else {
      await sequelize.authenticate();
      logger.info('Database connection established');
    }

    await ensureDatabaseSchema();
    await ensureAdminUser();
    await ensureCynthiaAdmin();

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
