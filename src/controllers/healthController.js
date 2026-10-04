const { sequelize } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { redisClient } = require('../config/redis');

exports.health = asyncHandler(async (req, res) => {
  let db = 'down';
  try {
    await sequelize.authenticate();
    db = 'up';
  } catch (e) {
    db = 'down';
  }

  return res.json({
    success: true,
    status: 'ok',
    service: 'Motsamai Web Backend',
    environment: config.NODE_ENV || config.app?.env || process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    time: new Date().toISOString(),
    checks: { database: db },
  });
});

exports.detailedHealth = asyncHandler(async (req, res) => {
  const dbStatus = await sequelize.authenticate().then(() => 'healthy').catch(() => 'unhealthy');
  const redisStatus = config.REDIS_URL ? (redisClient && redisClient.isReady ? 'healthy' : 'unhealthy') : 'not_configured';
  
  const healthData = {
    status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    services: {
      database: { status: dbStatus },
      cache: { status: redisStatus },
      messaging: { status: 'not_configured' }
    },
    system: {
      memoryUsage: process.memoryUsage(),
      platform: process.platform
    }
  };

  return res.status(dbStatus === 'healthy' ? 200 : 503).json(healthData);
});

exports.databaseHealth = asyncHandler(async (req, res) => {
  const start = Date.now();
  await sequelize.authenticate();
  const duration = Date.now() - start;

  return res.json({
    status: 'healthy',
    responseTime: `${duration}ms`,
    connection: 'active'
  });
});

exports.info = asyncHandler(async (req, res) => {
  return res.json({
    version: '2.0.0',
    name: 'motsamai-platform-api',
    description: 'Ride-sharing backend for Lesotho'
  });
});

exports.liveness = asyncHandler(async (req, res) => {
  return res.json({ status: 'alive', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

exports.readiness = asyncHandler(async (req, res) => {
  const database = await sequelize.authenticate().then(() => true).catch(() => false);
  const redis = config.REDIS_URL ? Boolean(redisClient && redisClient.isReady) : true;
  const ready = database && redis;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks: { database, redis },
    timestamp: new Date().toISOString(),
  });
});

exports.redisHealth = asyncHandler(async (req, res) => {
  if (!config.REDIS_URL) {
    return res.json({ status: 'not_configured', required: false });
  }
  return res.status(redisClient && redisClient.isReady ? 200 : 503).json({
    status: redisClient && redisClient.isReady ? 'healthy' : 'unhealthy',
  });
});

exports.queueHealth = asyncHandler(async (req, res) => {
  return res.json({ status: 'not_configured', required: false });
});

exports.paymentHealth = asyncHandler(async (req, res) => {
  return res.json({
    status: config.ENABLE_PAYMENTS ? 'configured' : 'disabled',
    enabled: config.ENABLE_PAYMENTS,
  });
});

exports.storageHealth = asyncHandler(async (req, res) => {
  const configured = Boolean(config.SUPABASE?.url && config.SUPABASE?.storageBucket);
  return res.status(configured ? 200 : 200).json({
    status: configured ? 'configured' : 'not_configured',
    provider: 'supabase',
    required: false,
  });
});

exports.metrics = asyncHandler(async (req, res) => {
  return res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
