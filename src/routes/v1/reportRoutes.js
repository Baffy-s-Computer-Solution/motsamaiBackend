/**
 * Report Routes
 * Version: 2.0.0
 * Description: Reporting and data export endpoints
 * 
 * @module routes/v1/reportRoutes
 * @requires express
 * @requires controllers/reportController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/report.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const reportController = require('../../controllers/reportController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const reportValidation = require('../../middleware/report.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all report routes
 */
router.use(auth, requestLogger);

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * @route GET /api/v1/reports
 * @description Get available reports
 * @access Admin, Manager roles
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [type] - Filter by report type
 * @queryParam {string} [status] - Filter by report status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated report list
 * 
 * @example
 * GET /api/v1/reports?page=1&type=financial&status=completed
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/',
  authorizeRoles('admin', 'manager'),
  cacheMiddleware({ ttl: 30 }),
  reportController.list
);

/**
 * @route POST /api/v1/reports/generate
 * @description Generate a new report
 * @access Admin, Manager roles
 * @rateLimit 3 requests per minute per user
 * 
 * @body {string} type - Report type (financial/operational/user/driver/ride)
 * @body {string} name - Report name
 * @body {string} [description] - Report description
 * @body {string} period - Report period (day/week/month/quarter/year/custom)
 * @body {string} [startDate] - Custom start date (for custom period)
 * @body {string} [endDate] - Custom end date (for custom period)
 * @body {string} [format=json] - Output format (json/csv/pdf/excel)
 * @body {Object} [filters] - Report filters
 * @body {Object} [aggregations] - Data aggregations
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Generated report or download URL
 * 
 * @example
 * POST /api/v1/reports/generate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "type": "financial",
 *   "name": "Monthly Revenue Report",
 *   "period": "month",
 *   "format": "pdf",
 *   "filters": { "region": "NYC" },
 *   "aggregations": { "byVehicleType": true }
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "reportId": "rpt_123",
 *     "status": "processing",
 *     "estimatedCompletion": "2024-01-15T11:00:00Z"
 *   }
 * }
 */
router.post(
  '/generate',
  authorizeRoles('admin', 'manager'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many report generation attempts, please slow down'
  }),
  validate(reportValidation.generateReport),
  reportController.generate
);

/**
 * @route GET /api/v1/reports/:id
 * @description Get report details
 * @access Admin, Manager roles
 * @cache 30 seconds
 * 
 * @param {string} id - Report ID
 * @returns {Object} Report details
 * 
 * @example
 * GET /api/v1/reports/rpt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  authorizeRoles('admin', 'manager'),
  cacheMiddleware({ ttl: 30 }),
  validate(reportValidation.getReportById),
  reportController.getReportById
);

/**
 * @route GET /api/v1/reports/:id/download
 * @description Download generated report
 * @access Admin, Manager roles
 * 
 * @param {string} id - Report ID
 * @returns {File} Report file
 * 
 * @example
 * GET /api/v1/reports/rpt_123/download
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/download',
  authorizeRoles('admin', 'manager'),
  validate(reportValidation.downloadReport),
  reportController.download
);

/**
 * @route DELETE /api/v1/reports/:id
 * @description Delete a report (admin only)
 * @access Admin only
 * 
 * @param {string} id - Report ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/reports/rpt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Report no longer needed" }
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(reportValidation.deleteReport),
  reportController.delete
);

// =============================================================================
// FINANCIAL REPORTS
// =============================================================================

/**
 * @route GET /api/v1/reports/financial/revenue
 * @description Generate revenue report
 * @access Admin, Finance roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [groupBy] - Group by (day/week/month)
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Revenue report data
 * 
 * @example
 * GET /api/v1/reports/financial/revenue?period=quarter&groupBy=week
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/financial/revenue',
  authorizeRoles('admin', 'finance'),
  validate(reportValidation.getRevenueReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getRevenueReport
);

/**
 * @route GET /api/v1/reports/financial/payouts
 * @description Generate payout report
 * @access Admin, Finance roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [status] - Payout status filter
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Payout report data
 * 
 * @example
 * GET /api/v1/reports/financial/payouts?period=month&status=completed
 */
router.get(
  '/financial/payouts',
  authorizeRoles('admin', 'finance'),
  validate(reportValidation.getPayoutReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getPayoutReport
);

/**
 * @route GET /api/v1/reports/financial/tax
 * @description Generate tax report
 * @access Admin, Finance roles
 * @cache 5 minutes
 * 
 * @queryParam {string} year - Tax year
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Tax report data
 * 
 * @example
 * GET /api/v1/reports/financial/tax?year=2024
 */
router.get(
  '/financial/tax',
  authorizeRoles('admin', 'finance'),
  validate(reportValidation.getTaxReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getTaxReport
);

// =============================================================================
// OPERATIONAL REPORTS
// =============================================================================

/**
 * @route GET /api/v1/reports/operational/rides
 * @description Generate ride operations report
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [region] - Filter by region
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Ride operations report
 * 
 * @example
 * GET /api/v1/reports/operational/rides?period=week&region=NYC
 */
router.get(
  '/operational/rides',
  authorizeRoles('admin', 'manager'),
  validate(reportValidation.getRideOperationsReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getRideOperationsReport
);

/**
 * @route GET /api/v1/reports/operational/drivers
 * @description Generate driver performance report
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [status] - Driver status filter
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Driver performance report
 * 
 * @example
 * GET /api/v1/reports/operational/drivers?period=month
 */
router.get(
  '/operational/drivers',
  authorizeRoles('admin', 'manager'),
  validate(reportValidation.getDriverPerformanceReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getDriverPerformanceReport
);

/**
 * @route GET /api/v1/reports/operational/incidents
 * @description Generate incident report
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [severity] - Filter by severity
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} Incident report
 * 
 * @example
 * GET /api/v1/reports/operational/incidents?period=month&severity=high
 */
router.get(
  '/operational/incidents',
  authorizeRoles('admin', 'manager'),
  validate(reportValidation.getIncidentReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getIncidentReport
);

// =============================================================================
// USER REPORTS
// =============================================================================

/**
 * @route GET /api/v1/reports/users/activity
 * @description Generate user activity report
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [userType] - User type filter
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} User activity report
 * 
 * @example
 * GET /api/v1/reports/users/activity?period=month&userType=rider
 */
router.get(
  '/users/activity',
  authorizeRoles('admin'),
  validate(reportValidation.getUserActivityReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getUserActivityReport
);

/**
 * @route GET /api/v1/reports/users/retention
 * @description Generate user retention report
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Report period
 * @queryParam {number} [cohortMonths=12] - Cohort analysis months
 * @queryParam {string} [format=json] - Output format
 * 
 * @returns {Object} User retention report
 * 
 * @example
 * GET /api/v1/reports/users/retention?cohortMonths=12
 */
router.get(
  '/users/retention',
  authorizeRoles('admin'),
  validate(reportValidation.getUserRetentionReport),
  cacheMiddleware({ ttl: 300 }),
  reportController.getUserRetentionReport
);

// =============================================================================
// CUSTOM REPORTS
// =============================================================================

/**
 * @route POST /api/v1/reports/custom
 * @description Create a custom report definition
 * @access Admin only
 * 
 * @body {string} name - Custom report name
 * @body {string} [description] - Report description
 * @body {string} dataSource - Data source (rides/users/drivers/payments)
 * @body {Object} fields - Fields to include
 * @body {Object} filters - Report filters
 * @body {Object} grouping - Grouping configuration
 * @body {Object} sorting - Sorting configuration
 * @body {string} schedule - Schedule (none/daily/weekly/monthly)
 * 
 * @returns {Object} Created custom report definition
 * 
 * @example
 * POST /api/v1/reports/custom
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "name": "Weekly Driver Earnings",
 *   "dataSource": "payments",
 *   "fields": { "driverId": true, "totalEarnings": true, "rideCount": true },
 *   "filters": { "status": "completed", "period": "week" },
 *   "schedule": "weekly"
 * }
 */
router.post(
  '/custom',
  authorizeRoles('admin'),
  validate(reportValidation.createCustomReport),
  reportController.createCustomReport
);

/**
 * @route GET /api/v1/reports/custom
 * @description Get custom reports
 * @access Admin only
 * 
 * @returns {Object} List of custom reports
 * 
 * @example
 * GET /api/v1/reports/custom
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/custom',
  authorizeRoles('admin'),
  validate(reportValidation.getCustomReports),
  reportController.getCustomReports
);

/**
 * @route PUT /api/v1/reports/custom/:id
 * @description Update custom report definition
 * @access Admin only
 * 
 * @param {string} id - Custom report ID
 * @body {Object} updates - Fields to update
 * 
 * @returns {Object} Updated custom report
 * 
 * @example
 * PUT /api/v1/reports/custom/crpt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "schedule": "daily", "filters": { "region": "NYC" } }
 */
router.put(
  '/custom/:id',
  authorizeRoles('admin'),
  validate(reportValidation.updateCustomReport),
  reportController.updateCustomReport
);

/**
 * @route DELETE /api/v1/reports/custom/:id
 * @description Delete custom report definition
 * @access Admin only
 * 
 * @param {string} id - Custom report ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/reports/custom/crpt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/custom/:id',
  authorizeRoles('admin'),
  validate(reportValidation.deleteCustomReport),
  reportController.deleteCustomReport
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/reports/health
 * @description Health check for report routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/reports/health
 * Response: { status: 'healthy', endpoint: '/api/v1/reports', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/reports',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      reportGeneration: 'operational',
      reportExport: 'operational'
    }
  });
});

module.exports = router;
