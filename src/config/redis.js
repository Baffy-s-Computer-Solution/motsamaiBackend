const logger = require('../utils/logger');
const config = require('./index');

let redisClient = null;
let connectRedis = async () => {
  return;
};

const createStubClient = () => {
  const stub = {
    isOpen: false,
    isReady: false,
    on: () => {},
    connect: async () => {
      stub.isOpen = true;
      stub.isReady = true;
      logger.info('Stub Redis client connected');
    },
    quit: async () => {
      stub.isOpen = false;
      stub.isReady = false;
      logger.info('Stub Redis client disconnected');
    },
    disconnect: async () => {
      stub.isOpen = false;
      stub.isReady = false;
      logger.info('Stub Redis client disconnected');
    },
    get: async () => null,
    set: async () => null,
    del: async () => null,
    exists: async () => 0,
    expire: async () => null,
    publish: async () => null,
  };

  return stub;
};

try {
  const { createClient } = require('redis');
  const redisOptions = {
    url: config.REDIS_URL || `redis://${config.REDIS.host || 'localhost'}:${config.REDIS.port || 6379}`,
  };

  if (config.REDIS.password) {
    redisOptions.password = config.REDIS.password;
  }

  if (config.REDIS.tls) {
    redisOptions.socket = { tls: true, rejectUnauthorized: false };
  }

  redisClient = createClient(redisOptions);

  redisClient.on('error', (err) => logger.error('Redis Client Error', err));
  redisClient.on('connect', () => logger.info('Redis Client Connected'));
  redisClient.on('ready', () => logger.info('Redis Client Ready'));
  redisClient.on('end', () => logger.warn('Redis Client connection closed'));

  connectRedis = async () => {
    if (!redisClient.isOpen) {
      try {
        await redisClient.connect();
      } catch (err) {
        logger.error('Redis connection failed, falling back to stub client:', err.message || err);
        redisClient = createStubClient();
        await redisClient.connect();
      }
    }
  };
} catch (err) {
  logger.warn('Redis package not available or failed to initialize, using stub client.', err.message || err);
  redisClient = createStubClient();
  connectRedis = async () => {
    if (!redisClient.isOpen) await redisClient.connect();
  };
}

module.exports = {
  redisClient,
  connectRedis,
};
