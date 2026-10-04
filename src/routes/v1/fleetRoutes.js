/**
 * Fleet Routes
 * Version: 2.0.0
 * Description: Fleet management endpoints for vehicle fleets
 * 
 * @module routes/v1/fleetRoutes
 * @requires express
 * @requires controllers/fleetController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/fleet.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const fleetController = require('../../controllers/fleetController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const fleetValidation = require('../../middleware/fleet.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const { upload } = require('../../utils/fileUpload');

/**
 * Apply authentication to all fleet routes
 * Fleet operations require authentication
 */
router.use(auth, requestLogger);

// =============================================================================
// FLEET MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/fleet
 * @description Get fleet list with filtering
 * @access Admin, FleetManager roles
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by fleet status (active/inactive/archived)
 * @queryParam {string} [search] - Search by fleet name or ID
 * @queryParam {string} [ownerId] - Filter by owner ID
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order (asc/desc)
 * 
 * @returns {Object} Paginated fleet list
 * 
 * @example
 * GET /api/v1/fleet?page=1&status=active&limit=10
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "success": true,
 *   "data": {
 *     "fleets": [...],
 *     "pagination": { "page": 1, "limit": 10, "total": 50, "pages": 5 }
 *   }
 * }
 */
router.get(
  '/',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.listFleets),
  cacheMiddleware({ ttl: 60 }),
  fleetController.list
);

/**
 * @route POST /api/v1/fleet
 * @description Create a new fleet
 * @access Admin, FleetManager roles
 * @rateLimit 5 requests per minute per user
 * 
 * @body {string} name - Fleet name
 * @body {string} [description] - Fleet description
 * @body {string} [ownerId] - Fleet owner ID
 * @body {Object} [settings] - Fleet settings
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created fleet
 * 
 * @example
 * POST /api/v1/fleet
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "name": "Premium Fleet",
 *   "description": "Luxury vehicle fleet",
 *   "settings": { "defaultVehicleType": "premium" }
 * }
 */
router.post(
  '/',
  authorizeRoles('admin', 'fleetManager'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many fleet creation attempts, please slow down'
  }),
  validate(fleetValidation.createFleet),
  fleetController.create
);

/**
 * @route GET /api/v1/fleet/:id
 * @description Get fleet details by ID
 * @access Admin, FleetManager roles
 * @cache 1 minute
 * 
 * @param {string} id - Fleet ID
 * @returns {Object} Fleet details with vehicles and drivers
 * 
 * @example
 * GET /api/v1/fleet/flt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  authorizeRoles('admin', 'fleetManager'),
  cacheMiddleware({ ttl: 60 }),
  validate(fleetValidation.getFleetById),
  fleetController.getFleetById
);

/**
 * @route PUT /api/v1/fleet/:id
 * @description Update fleet details
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @body {string} [name] - Fleet name
 * @body {string} [description] - Fleet description
 * @body {string} [status] - Fleet status (active/inactive/archived)
 * @body {Object} [settings] - Fleet settings
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Updated fleet
 * 
 * @example
 * PUT /api/v1/fleet/flt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "name": "Premium Fleet Plus", "status": "active" }
 */
router.put(
  '/:id',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.updateFleet),
  fleetController.update
);

/**
 * @route DELETE /api/v1/fleet/:id
 * @description Delete a fleet (soft delete)
 * @access Admin only
 * 
 * @param {string} id - Fleet ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/fleet/flt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Fleet merged with another" }
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(fleetValidation.deleteFleet),
  fleetController.delete
);

// =============================================================================
// FLEET VEHICLES
// =============================================================================

/**
 * @route GET /api/v1/fleet/:id/vehicles
 * @description Get vehicles in a fleet
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by vehicle status
 * @queryParam {string} [vehicleType] - Filter by vehicle type
 * 
 * @returns {Object} Paginated vehicle list
 * 
 * @example
 * GET /api/v1/fleet/flt_123/vehicles?page=1&status=active
 */
router.get(
  '/:id/vehicles',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.getFleetVehicles),
  fleetController.getFleetVehicles
);

/**
 * @route POST /api/v1/fleet/:id/vehicles
 * @description Add vehicle to fleet
 * @access Admin, FleetManager roles
 * @rateLimit 10 requests per minute per user
 * 
 * @param {string} id - Fleet ID
 * @body {string} vehicleId - Vehicle ID to add
 * @body {string} [assignmentDate] - Assignment date
 * @body {Object} [details] - Assignment details
 * 
 * @returns {Object} Added vehicle confirmation
 * 
 * @example
 * POST /api/v1/fleet/flt_123/vehicles
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "vehicleId": "veh_123", "details": { "primaryDriver": "drv_456" } }
 */
router.post(
  '/:id/vehicles',
  authorizeRoles('admin', 'fleetManager'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many vehicle addition attempts, please slow down'
  }),
  validate(fleetValidation.addVehicleToFleet),
  fleetController.addVehicleToFleet
);

/**
 * @route DELETE /api/v1/fleet/:id/vehicles/:vehicleId
 * @description Remove vehicle from fleet
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @param {string} vehicleId - Vehicle ID
 * @body {string} [reason] - Removal reason
 * 
 * @returns {Object} Removal confirmation
 * 
 * @example
 * DELETE /api/v1/fleet/flt_123/vehicles/veh_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Vehicle sold" }
 */
router.delete(
  '/:id/vehicles/:vehicleId',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.removeVehicleFromFleet),
  fleetController.removeVehicleFromFleet
);

// =============================================================================
// FLEET DRIVERS
// =============================================================================

/**
 * @route GET /api/v1/fleet/:id/drivers
 * @description Get drivers in a fleet
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by driver status
 * 
 * @returns {Object} Paginated driver list
 * 
 * @example
 * GET /api/v1/fleet/flt_123/drivers?page=1
 */
router.get(
  '/:id/drivers',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.getFleetDrivers),
  fleetController.getFleetDrivers
);

/**
 * @route POST /api/v1/fleet/:id/drivers
 * @description Add driver to fleet
 * @access Admin, FleetManager roles
 * @rateLimit 10 requests per minute per user
 * 
 * @param {string} id - Fleet ID
 * @body {string} driverId - Driver ID to add
 * @body {string} [role] - Role in fleet (driver/manager/supervisor)
 * @body {Object} [details] - Assignment details
 * 
 * @returns {Object} Added driver confirmation
 * 
 * @example
 * POST /api/v1/fleet/flt_123/drivers
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "driverId": "drv_123", "role": "driver" }
 */
router.post(
  '/:id/drivers',
  authorizeRoles('admin', 'fleetManager'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many driver addition attempts, please slow down'
  }),
  validate(fleetValidation.addDriverToFleet),
  fleetController.addDriverToFleet
);

/**
 * @route DELETE /api/v1/fleet/:id/drivers/:driverId
 * @description Remove driver from fleet
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @param {string} driverId - Driver ID
 * @body {string} [reason] - Removal reason
 * 
 * @returns {Object} Removal confirmation
 * 
 * @example
 * DELETE /api/v1/fleet/flt_123/drivers/drv_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Driver resigned" }
 */
router.delete(
  '/:id/drivers/:driverId',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.removeDriverFromFleet),
  fleetController.removeDriverFromFleet
);

// =============================================================================
// FLEET STATISTICS
// =============================================================================

/**
 * @route GET /api/v1/fleet/:id/statistics
 * @description Get fleet statistics
 * @access Admin, FleetManager roles
 * @cache 5 minutes
 * 
 * @param {string} id - Fleet ID
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Fleet statistics including:
 *   - vehicleStats: { total, active, inactive, byType }
 *   - driverStats: { total, active, online }
 *   - performanceStats: { rides, revenue, rating }
 *   - utilizationStats: { averageUtilization, peakHours }
 * 
 * @example
 * GET /api/v1/fleet/flt_123/statistics?period=week
 */
router.get(
  '/:id/statistics',
  authorizeRoles('admin', 'fleetManager'),
  cacheMiddleware({ ttl: 300 }),
  validate(fleetValidation.getFleetStatistics),
  fleetController.getFleetStatistics
);

/**
 * @route GET /api/v1/fleet/:id/performance
 * @description Get fleet performance metrics
 * @access Admin, FleetManager roles
 * @cache 5 minutes
 * 
 * @param {string} id - Fleet ID
 * @queryParam {string} [period=month] - Performance period
 * @queryParam {string} [metric] - Specific metric to retrieve
 * 
 * @returns {Object} Performance metrics
 * 
 * @example
 * GET /api/v1/fleet/flt_123/performance?period=month&metric=revenue
 */
router.get(
  '/:id/performance',
  authorizeRoles('admin', 'fleetManager'),
  cacheMiddleware({ ttl: 300 }),
  validate(fleetValidation.getFleetPerformance),
  fleetController.getFleetPerformance
);

// =============================================================================
// FLEET FINANCIALS
// =============================================================================

/**
 * @route GET /api/v1/fleet/:id/financials
 * @description Get fleet financial data
 * @access Admin, FleetManager, Finance roles
 * @cache 5 minutes
 * 
 * @param {string} id - Fleet ID
 * @queryParam {string} [period=month] - Financial period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Financial data including:
 *   - revenue: { total, byVehicle, byDriver }
 *   - expenses: { total, breakdown }
 *   - profitability: { netProfit, margin }
 * 
 * @example
 * GET /api/v1/fleet/flt_123/financials?period=quarter
 */
router.get(
  '/:id/financials',
  authorizeRoles('admin', 'fleetManager', 'finance'),
  cacheMiddleware({ ttl: 300 }),
  validate(fleetValidation.getFleetFinancials),
  fleetController.getFleetFinancials
);

// =============================================================================
// FLEET MAINTENANCE
// =============================================================================

/**
 * @route GET /api/v1/fleet/:id/maintenance
 * @description Get fleet maintenance records
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by maintenance status
 * @queryParam {string} [type] - Filter by maintenance type
 * 
 * @returns {Object} Paginated maintenance records
 * 
 * @example
 * GET /api/v1/fleet/flt_123/maintenance?page=1&status=scheduled
 */
router.get(
  '/:id/maintenance',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.getFleetMaintenance),
  fleetController.getFleetMaintenance
);

/**
 * @route POST /api/v1/fleet/:id/maintenance
 * @description Schedule maintenance for fleet vehicles
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @body {string} vehicleId - Vehicle ID
 * @body {string} type - Maintenance type (routine/repair/inspection)
 * @body {string} scheduledDate - Scheduled date
 * @body {string} [description] - Maintenance description
 * @body {string} [priority] - Priority (low/medium/high/urgent)
 * 
 * @returns {Object} Created maintenance record
 * 
 * @example
 * POST /api/v1/fleet/flt_123/maintenance
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "vehicleId": "veh_123",
 *   "type": "routine",
 *   "scheduledDate": "2024-02-15",
 *   "description": "Oil change and inspection"
 * }
 */
router.post(
  '/:id/maintenance',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.scheduleMaintenance),
  fleetController.scheduleMaintenance
);

/**
 * @route PUT /api/v1/fleet/:id/maintenance/:maintenanceId
 * @description Update maintenance record
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @param {string} maintenanceId - Maintenance ID
 * @body {Object} updates - Fields to update
 * 
 * @returns {Object} Updated maintenance record
 * 
 * @example
 * PUT /api/v1/fleet/flt_123/maintenance/mtn_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "completed", "completedDate": "2024-02-16" }
 */
router.put(
  '/:id/maintenance/:maintenanceId',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.updateMaintenance),
  fleetController.updateMaintenance
);

// =============================================================================
// FLEET REPORTS
// =============================================================================

/**
 * @route GET /api/v1/fleet/reports/generate
 * @description Generate fleet report
 * @access Admin, FleetManager roles
 * 
 * @queryParam {string} fleetId - Fleet ID
 * @queryParam {string} type - Report type (summary/detailed/financial)
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [format=json] - Output format (json/pdf/csv)
 * 
 * @returns {Object|File} Generated report
 * 
 * @example
 * GET /api/v1/fleet/reports/generate?fleetId=flt_123&type=summary&format=pdf
 */
router.get(
  '/reports/generate',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.generateReport),
  fleetController.generateReport
);

// =============================================================================
// FLEET SETTINGS
// =============================================================================

/**
 * @route GET /api/v1/fleet/settings/default
 * @description Get default fleet settings
 * @access Admin, FleetManager roles
 * @cache 1 hour
 * 
 * @returns {Object} Default fleet settings
 * 
 * @example
 * GET /api/v1/fleet/settings/default
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/settings/default',
  authorizeRoles('admin', 'fleetManager'),
  cacheMiddleware({ ttl: 3600 }),
  fleetController.getDefaultSettings
);

/**
 * @route PUT /api/v1/fleet/:id/settings
 * @description Update fleet settings
 * @access Admin, FleetManager roles
 * 
 * @param {string} id - Fleet ID
 * @body {Object} settings - Fleet settings
 * @body {Object} [settings.vehicleSettings] - Vehicle preferences
 * @body {Object} [settings.driverSettings] - Driver preferences
 * @body {Object} [settings.operationalSettings] - Operational settings
 * 
 * @returns {Object} Updated settings
 * 
 * @example
 * PUT /api/v1/fleet/flt_123/settings
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "settings": {
 *     "vehicleSettings": { "defaultType": "premium" },
 *     "driverSettings": { "maxDistance": 50 }
 *   }
 * }
 */
router.put(
  '/:id/settings',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.updateFleetSettings),
  fleetController.updateFleetSettings
);

// =============================================================================
// FLEET ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/fleet/analytics/comparison
 * @description Compare fleet performance across fleets
 * @access Admin only
 * 
 * @queryParam {string[]} fleetIds - Array of fleet IDs to compare
 * @queryParam {string} [period=month] - Comparison period
 * @queryParam {string[]} [metrics] - Metrics to compare
 * 
 * @returns {Object} Fleet comparison data
 * 
 * @example
 * GET /api/v1/fleet/analytics/comparison?fleetIds[]=flt_123&fleetIds[]=flt_456&period=month
 */
router.get(
  '/analytics/comparison',
  authorizeRoles('admin'),
  validate(fleetValidation.compareFleets),
  fleetController.compareFleets
);

/**
 * @route GET /api/v1/fleet/analytics/trends
 * @description Get fleet trends over time
 * @access Admin, FleetManager roles
 * 
 * @queryParam {string} fleetId - Fleet ID
 * @queryParam {string} [period=month] - Trend period
 * @queryParam {string} [metric] - Specific metric to trend
 * 
 * @returns {Object} Trend data
 * 
 * @example
 * GET /api/v1/fleet/analytics/trends?fleetId=flt_123&period=year&metric=rides
 */
router.get(
  '/analytics/trends',
  authorizeRoles('admin', 'fleetManager'),
  validate(fleetValidation.getFleetTrends),
  fleetController.getFleetTrends
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/fleet/health
 * @description Health check for fleet routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/fleet/health
 * Response: { status: 'healthy', endpoint: '/api/v1/fleet', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/fleet',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      fleetManagement: 'operational',
      vehicleManagement: 'operational',
      driverManagement: 'operational'
    }
  });
});

module.exports = router;