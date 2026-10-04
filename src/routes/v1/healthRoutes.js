/**
 * Health Check Routes
 * Version: 2.0.0
 * Description: System health monitoring endpoints
 * 
 * @module routes/v1/healthRoutes
 * @requires express
 * @requires controllers/healthController
 * @requires middleware/cache
 */

const express = require('express');
const router = express.Router();

// Controllers
const healthController = require('../../controllers/healthController');

// Middleware
const { cacheMiddleware } = require('../../middleware/cache');

// =============================================================================
// BASIC HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/health
 * @description Basic health check endpoint
 * @access Public
 * @cache 10 seconds
 * 
 * @returns {Object} Basic health status
 * 
 * @example
 * GET /api/v1/health
 * Response: {
 *   "status": "healthy",
 *   "timestamp": "2024-01-15T10:30:00Z",
 *   "uptime": 123456,
 *   "version": "2.0.0",
 *   "environment": "production"
 * }
 */
router.get(
  '/',
  cacheMiddleware({ ttl: 10 }),
  healthController.health
);

// =============================================================================
// DETAILED HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/health/detailed
 * @description Detailed health check with service statuses
 * @access Admin only
 * @cache 30 seconds
 * 
 * @returns {Object} Detailed health status including:
 *   - status: overall health status
 *   - timestamp: current timestamp
 *   - uptime: server uptime in seconds
 *   - version: API version
 *   - environment: running environment
 *   - services: {
 *       database: { status, responseTime, connections }
 *       redis: { status, responseTime, memory }
 *       queue: { status, responseTime, queueSize }
 *       payment: { status, responseTime, providerStatus }
 *       storage: { status, responseTime, usage }
 *       geocoding: { status, responseTime, quota }
 *     }
 *   - system: { cpu, memory, disk }
 * 
 * @example
 * GET /api/v1/health/detailed
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "status": "healthy",
 *   "services": {
 *     "database": { "status": "healthy", "responseTime": 5 },
 *     "redis": { "status": "healthy", "responseTime": 2 }
 *   }
 * }
 */
router.get(
  '/detailed',
  cacheMiddleware({ ttl: 30 }),
  healthController.detailedHealth
);

// =============================================================================
// SERVICE-SPECIFIC HEALTH CHECKS
// =============================================================================

/**
 * @route GET /api/v1/health/database
 * @description Database health check
 * @access Admin only
 * @cache 30 seconds
 * 
 * @returns {Object} Database health status
 * 
 * @example
 * GET /api/v1/health/database
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "status": "healthy",
 *   "responseTime": 5,
 *   "connections": 12,
 *   "maxConnections": 100
 * }
 */
router.get(
  '/database',
  cacheMiddleware({ ttl: 30 }),
  healthController.databaseHealth
);

/**
 * @route GET /api/v1/health/redis
 * @description Redis health check
 * @access Admin only
 * @cache 30 seconds
 * 
 * @returns {Object} Redis health status
 * 
 * @example
 * GET /api/v1/health/redis
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/redis',
  cacheMiddleware({ ttl: 30 }),
  healthController.redisHealth
);

/**
 * @route GET /api/v1/health/queue
 * @description Message queue health check
 * @access Admin only
 * @cache 30 seconds
 * 
 * @returns {Object} Queue health status
 * 
 * @example
 * GET /api/v1/health/queue
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/queue',
  cacheMiddleware({ ttl: 30 }),
  healthController.queueHealth
);

/**
 * @route GET /api/v1/health/payment
 * @description Payment service health check
 * @access Admin only
 * @cache 60 seconds
 * 
 * @returns {Object} Payment service health status
 * 
 * @example
 * GET /api/v1/health/payment
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/payment',
  cacheMiddleware({ ttl: 60 }),
  healthController.paymentHealth
);

/**
 * @route GET /api/v1/health/storage
 * @description Storage service health check
 * @access Admin only
 * @cache 60 seconds
 * 
 * @returns {Object} Storage health status
 * 
 * @example
 * GET /api/v1/health/storage
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/storage',
  cacheMiddleware({ ttl: 60 }),
  healthController.storageHealth
);

// =============================================================================
// READINESS & LIVENESS PROBES
// =============================================================================

/**
 * @route GET /api/v1/health/ready
 * @description Kubernetes readiness probe
 * @access Public
 * @cache 5 seconds
 * 
 * @returns {Object} Readiness status
 * 
 * @example
 * GET /api/v1/health/ready
 * Response: { "status": "ready" }
 */
router.get(
  '/ready',
  cacheMiddleware({ ttl: 5 }),
  healthController.readiness
);

/**
 * @route GET /api/v1/health/live
 * @description Kubernetes liveness probe
 * @access Public
 * @cache 5 seconds
 * 
 * @returns {Object} Liveness status
 * 
 * @example
 * GET /api/v1/health/live
 * Response: { "status": "alive" }
 */
router.get(
  '/live',
  cacheMiddleware({ ttl: 5 }),
  healthController.liveness
);

// =============================================================================
// METRICS
// =============================================================================

/**
 * @route GET /api/v1/health/metrics
 * @description Prometheus metrics endpoint
 * @access Admin only
 * @cache 10 seconds
 * 
 * @returns {string} Prometheus-formatted metrics
 * 
 * @example
 * GET /api/v1/health/metrics
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: # HELP http_requests_total Total HTTP requests
 * # TYPE http_requests_total counter
 * http_requests_total{method="GET",route="/api/v1/health"} 12345
 */
router.get(
  '/metrics',
  healthController.metrics
);

// =============================================================================
// SYSTEM INFORMATION
// =============================================================================

/**
 * @route GET /api/v1/health/info
 * @description System information
 * @access Public
 * @cache 1 hour
 * 
 * @returns {Object} System information
 * 
 * @example
 * GET /api/v1/health/info
 * Response: {
 *   "version": "2.0.0",
 *   "environment": "production",
 *   "nodeVersion": "18.0.0",
 *   "platform": "linux",
 *   "memoryUsage": { "rss": 1024, "heapTotal": 512, "heapUsed": 256 }
 * }
 */
router.get(
  '/info',
  cacheMiddleware({ ttl: 3600 }),
  healthController.info
);

module.exports = router;