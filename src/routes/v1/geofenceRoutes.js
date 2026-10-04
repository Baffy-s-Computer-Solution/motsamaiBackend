/**
 * Geofence Routes
 * Version: 1.0.0
 * Description: Geofence management endpoints
 * 
 * @module routes/v1/geofenceRoutes
 * @requires express
 * @requires controllers/geofenceController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/geofence.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const geofenceController = require('../../controllers/geofenceController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const geofenceValidation = require('../../middleware/geofence.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all geofence routes
 */
router.use(auth, requestLogger);

// =============================================================================
// GEOFENCE MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/geofences
 * @description Get geofences
 * @access Admin, Manager roles
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [type] - Filter by type
 * @queryParam {string} [search] - Search by name
 * 
 * @returns {Object} Paginated geofence list
 */
router.get(
  '/',
  authorizeRoles('admin', 'manager'),
  validate(geofenceValidation.listGeofences),
  cacheMiddleware({ ttl: 30 }),
  geofenceController.list
);

/**
 * @route GET /api/v1/geofences/nearby
 * @description Get geofences near a location
 * @access All authenticated users
 * @cache 30 seconds
 * 
 * @queryParam {number} latitude - Center latitude
 * @queryParam {number} longitude - Center longitude
 * @queryParam {number} [radius=5] - Search radius in km
 * 
 * @returns {Object} Nearby geofences
 */
router.get(
  '/nearby',
  validate(geofenceValidation.getNearbyGeofences),
  cacheMiddleware({ ttl: 30 }),
  geofenceController.getNearby
);

/**
 * @route POST /api/v1/geofences
 * @description Create a geofence (admin only)
 * @access Admin only
 * 
 * @body {string} name - Geofence name
 * @body {string} type - Geofence type
 * @body {Object} boundary - Geofence boundary
 * @body {Object} [settings] - Geofence settings
 * 
 * @returns {Object} Created geofence
 */
router.post(
  '/',
  authorizeRoles('admin'),
  validate(geofenceValidation.createGeofence),
  geofenceController.create
);

/**
 * @route PUT /api/v1/geofences/:id
 * @description Update geofence (admin only)
 * @access Admin only
 * 
 * @param {string} id - Geofence ID
 * @body {Object} updates - Fields to update
 * 
 * @returns {Object} Updated geofence
 */
router.put(
  '/:id',
  authorizeRoles('admin'),
  validate(geofenceValidation.updateGeofence),
  geofenceController.update
);

/**
 * @route DELETE /api/v1/geofences/:id
 * @description Delete geofence (admin only)
 * @access Admin only
 * 
 * @param {string} id - Geofence ID
 * @returns {Object} Deletion confirmation
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(geofenceValidation.deleteGeofence),
  geofenceController.delete
);

// =============================================================================
// GEOFENCE MONITORING
// =============================================================================

/**
 * @route GET /api/v1/geofences/check
 * @description Check if location is within a geofence
 * @access All authenticated users
 * 
 * @queryParam {number} latitude - Location latitude
 * @queryParam {number} longitude - Location longitude
 * @queryParam {string} [geofenceId] - Specific geofence ID
 * 
 * @returns {Object} Geofence check result
 */
router.get(
  '/check',
  validate(geofenceValidation.checkGeofence),
  geofenceController.checkGeofence
);

/**
 * @route GET /api/v1/geofences/events
 * @description Get geofence events
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [geofenceId] - Geofence ID
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} Geofence events
 */
router.get(
  '/events',
  authorizeRoles('admin', 'manager'),
  validate(geofenceValidation.getGeofenceEvents),
  geofenceController.getEvents
);

module.exports = router;