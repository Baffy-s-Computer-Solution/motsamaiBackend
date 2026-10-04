/**
 * Analytics Routes
 * Version: 2.0.0
 * Description: Analytics and reporting endpoints for data insights
 * 
 * @module routes/v1/analyticsRoutes
 * @requires express
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires controllers/analyticsController
 */

const express = require('express');
const router = express.Router();

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const validate = require('../../middleware/validate');
const { analyticsValidation } = require('../../middleware/analytics.validation');

// Controllers
const analyticsController = require('../../controllers/analyticsController');

/**
 * Apply authentication to all analytics routes
 * Analytics data is sensitive and requires authentication
 */
router.use(auth, requestLogger);

// =============================================================================
// DASHBOARD ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/dashboard
 * @description Get comprehensive dashboard analytics
 * @access Admin, Manager, Analyst roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=day] - Time period (day/week/month/year)
 * @queryParam {string} [startDate] - Custom start date (ISO format)
 * @queryParam {string} [endDate] - Custom end date (ISO format)
 * 
 * @returns {Object} Dashboard analytics
 * 
 * @example
 * GET /api/v1/analytics/dashboard?period=week
 */
router.get(
  '/dashboard',
  authorizeRoles('admin', 'manager', 'analyst'),
  cacheMiddleware({ ttl: 300 }),
  analyticsController.getDashboardAnalytics
);

// =============================================================================
// RIDE ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/rides
 * @description Get ride analytics and metrics
 * @access Admin, Manager, Analyst roles
 * 
 * @queryParam {string} [period=day] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [region] - Filter by region
 * @queryParam {string} [vehicleType] - Filter by vehicle type
 * 
 * @returns {Object} Ride analytics including:
 *   - totalRides, completedRides, cancelledRides
 *   - averageFare, totalRevenue
 *   - peakHours, popularRoutes
 *   - driverUtilization
 * 
 * @example
 * GET /api/v1/analytics/rides?period=month&region=LA
 */
router.get(
  '/rides',
  authorizeRoles('admin', 'manager', 'analyst'),
  validate(analyticsValidation.getRideAnalytics),
  analyticsController.getRideAnalytics
);

/**
 * @route GET /api/v1/analytics/rides/surge-pricing
 * @description Get surge pricing analytics
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {number} [latitude] - Center latitude
 * @queryParam {number} [longitude] - Center longitude
 * @queryParam {number} [radius] - Radius in kilometers
 * 
 * @returns {Object} Surge pricing analytics
 * 
 * @example
 * GET /api/v1/analytics/rides/surge-pricing?latitude=34.05&longitude=-118.25&radius=10
 */
router.get(
  '/rides/surge-pricing',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getSurgePricingAnalytics),
  analyticsController.getSurgePricingAnalytics
);

// =============================================================================
// USER ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/users
 * @description Get user analytics and metrics
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [period=month] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [userType] - User type (rider/driver)
 * 
 * @returns {Object} User analytics
 * 
 * @example
 * GET /api/v1/analytics/users?period=month&userType=rider
 */
router.get(
  '/users',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getUserAnalytics),
  cacheMiddleware({ ttl: 600 }),
  analyticsController.getUserAnalytics
);

/**
 * @route GET /api/v1/analytics/users/retention
 * @description Get user retention analytics
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [period=month] - Time period
 * @queryParam {number} [cohortMonths=12] - Number of months for cohort analysis
 * 
 * @returns {Object} User retention metrics
 * 
 * @example
 * GET /api/v1/analytics/users/retention?cohortMonths=12
 */
router.get(
  '/users/retention',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getRetentionAnalytics),
  analyticsController.getUserRetentionAnalytics
);

// =============================================================================
// FINANCIAL ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/financial
 * @description Get financial analytics and metrics
 * @access Admin, Finance roles
 * 
 * @queryParam {string} [period=month] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [currency] - Currency filter
 * 
 * @returns {Object} Financial analytics
 * 
 * @example
 * GET /api/v1/analytics/financial?period=quarter
 */
router.get(
  '/financial',
  authorizeRoles('admin', 'finance'),
  validate(analyticsValidation.getFinancialAnalytics),
  cacheMiddleware({ ttl: 300 }),
  analyticsController.getFinancialAnalytics
);

/**
 * @route GET /api/v1/analytics/financial/revenue-breakdown
 * @description Get revenue breakdown by source
 * @access Admin, Finance roles
 * 
 * @queryParam {string} [period=month] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Revenue breakdown
 * 
 * @example
 * GET /api/v1/analytics/financial/revenue-breakdown?period=year
 */
router.get(
  '/financial/revenue-breakdown',
  authorizeRoles('admin', 'finance'),
  validate(analyticsValidation.getRevenueBreakdown),
  analyticsController.getRevenueBreakdown
);

// =============================================================================
// DRIVER ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/drivers
 * @description Get driver performance analytics
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [period=month] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [region] - Filter by region
 * 
 * @returns {Object} Driver analytics
 * 
 * @example
 * GET /api/v1/analytics/drivers?period=month&region=NYC
 */
router.get(
  '/drivers',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getDriverAnalytics),
  analyticsController.getDriverAnalytics
);

/**
 * @route GET /api/v1/analytics/drivers/top-performers
 * @description Get top performing drivers
 * @access Admin, Manager roles
 * 
 * @queryParam {number} [limit=10] - Number of top performers
 * @queryParam {string} [period=month] - Time period
 * @queryParam {string} [metric] - Performance metric (rides/rating/revenue)
 * 
 * @returns {Object} Top performers list
 * 
 * @example
 * GET /api/v1/analytics/drivers/top-performers?limit=5&metric=rating
 */
router.get(
  '/drivers/top-performers',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getTopPerformers),
  cacheMiddleware({ ttl: 600 }),
  analyticsController.getTopPerformers
);

// =============================================================================
// GEOGRAPHIC ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/geographic
 * @description Get geographic analytics and heat maps
 * @access Admin, Manager, Analyst roles
 * 
 * @queryParam {string} [period=day] - Time period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [region] - Specific region
 * @queryParam {string} [dataType=rides] - Data type (rides/drivers/requests)
 * 
 * @returns {Object} Geographic analytics
 * 
 * @example
 * GET /api/v1/analytics/geographic?period=day&dataType=rides
 */
router.get(
  '/geographic',
  authorizeRoles('admin', 'manager', 'analyst'),
  validate(analyticsValidation.getGeographicAnalytics),
  cacheMiddleware({ ttl: 300 }),
  analyticsController.getGeographicAnalytics
);

// =============================================================================
// PREDICTIVE ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/analytics/predictions/demand
 * @description Get demand predictions
 * @access Admin, Manager roles
 * 
 * @queryParam {string} [period=day] - Prediction period
 * @queryParam {number} [latitude] - Center latitude
 * @queryParam {number} [longitude] - Center longitude
 * @queryParam {number} [radius] - Radius in kilometers
 * 
 * @returns {Object} Demand predictions
 * 
 * @example
 * GET /api/v1/analytics/predictions/demand?period=day&latitude=34.05&longitude=-118.25
 */
router.get(
  '/predictions/demand',
  authorizeRoles('admin', 'manager'),
  validate(analyticsValidation.getDemandPrediction),
  analyticsController.getDemandPrediction
);

/**
 * @route GET /api/v1/analytics/predictions/eta
 * @description Get ETA predictions
 * @access Admin, Manager roles
 * 
 * @queryParam {number} originLat - Origin latitude
 * @queryParam {number} originLng - Origin longitude
 * @queryParam {number} destLat - Destination latitude
 * @queryParam {number} destLng - Destination longitude
 * @queryParam {string} [timeOfDay] - Time of day for prediction
 * 
 * @returns {Object} ETA prediction
 * 
 * @example
 * GET /api/v1/analytics/predictions/eta?originLat=34.05&originLng=-118.25&destLat=34.10&destLng=-118.30
 */
router.get(
  '/predictions/eta',
  authorizeRoles('admin', 'manager', 'analyst'),
  validate(analyticsValidation.getETAPrediction),
  analyticsController.getETAPrediction
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/analytics/health
 * @description Health check for analytics routes
 * @access Public
 * 
 * @returns {Object} Health status
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/analytics',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;