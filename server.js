#!/usr/bin/env node
/**
 * Production-ready Server for EasyGO Backend
 * @version 2.0.0
 */

const app = require('../app');
const config = require('./config');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const { initializeSocket } = require('./services/socketService');
const { startWorkers } = require('./jobs/worker');
const { redisClient } = require('./config/redis');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Close server
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed.');
          resolve();
        });
      });
    }

    // Close database connections
    if (sequelize) {
      await sequelize.close();
      logger.info('Database connections closed.');
    }

    // Close Redis connections
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connections closed.');
    }

    // Close socket connections
    if (io) {
      await io.close();
      logger.info('Socket.io connections closed.');
    }

    logger.info('Graceful shutdown completed.');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Initialize server
let server = null;
let io = null;

const startServer = async () => {
  try {
    // Validate environment
    if (!config.NODE_ENV) {
      throw new Error('NODE_ENV is not defined. Please set NODE_ENV environment variable.');
    }

    // Check database connection
    logger.info('Checking database connection...');
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    // Sync database models (in development only)
    if (config.NODE_ENV === 'development' && config.DB_SYNC) {
      await sequelize.sync({ alter: config.DB_SYNC_ALTER || false });
      logger.info('Database schema synchronized.');
    }

    // Initialize Redis if configured
    if (config.REDIS_URL) {
      await redisClient.connect();
      logger.info('Redis connection established successfully.');
    }

    // Create HTTP server
    const port = config.PORT || 4000;
    server = app.listen(port, () => {
      logger.info(`🚀 Motsamai Backend is running on port ${port}`);
      logger.info(`📡 Environment: ${config.NODE_ENV}`);
      logger.info(`🌐 API URL: http://localhost:${port}/api/v1`);
      logger.info(`📚 API Docs: http://localhost:${port}/api-docs`);
      logger.info(`💚 Health Check: http://localhost:${port}/health`);
    });

    // Initialize Socket.io
    io = initializeSocket(server);
    logger.info('Socket.io initialized successfully.');

    // Start background workers in production
    if (config.NODE_ENV === 'production') {
      await startWorkers();
      logger.info('Background workers started successfully.');
    }

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

    // Keep process alive
    process.stdin.resume();

    logger.info('✅ Server initialization complete.');
  } catch (error) {
    logger.error('❌ Server initialization failed:', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, server, io };