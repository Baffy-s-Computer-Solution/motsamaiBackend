/**
 * Admin Routes
 * Version: 2.0.0
 * Description: Administrative endpoints for system management
 * 
 * @module routes/v1/adminRoutes
 * @requires express
 * @requires controllers/admin.controller
 * @requires controllers/userController
 * @requires controllers/driverController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/audit.middleware
 * @requires middleware/pagination
 * @requires middleware/validate
 * @requires middleware/rateLimiter
 * @requires middleware/cache
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const adminController = require('../../controllers/admin.controller');
const userController = require('../../controllers/userController');
const driverController = require('../../controllers/driverController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const auditAdminAction = require('../../middleware/audit.middleware');
const pagination = require('../../middleware/pagination');
const validate = require('../../middleware/validate');
const { adminValidation } = require('../../middleware/admin.validation');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { cacheMiddleware } = require('../../middleware/cache');
const { requestLogger } = require('../../middleware/requestLogger');
const config = require('../../config');

/**
 * Apply global middleware to all admin routes
 * All admin routes require authentication, admin role, rate limiting, and audit logging
 */
router.use(
  requestLogger,           // Log all admin requests
  auth,                    // Authentication required
  authorizeRoles('admin'), // Admin role required
  auditAdminAction,        // Audit logging for compliance
  rateLimiter({            // Rate limiting for admin endpoints
    windowMs: config.rateLimit?.admin?.windowMs || 15 * 60 * 1000,
    max: config.rateLimit?.admin?.max || 1000,
    message: 'Too many admin requests, please try again later'
  })
);

// =============================================================================
// ADMIN DASHBOARD
// =============================================================================

/**
 * @route GET /api/v1/admin/dashboard
 * @description Get comprehensive dashboard statistics
 * @access Admin only
 * @cache 1 minute
 * 
 * @returns {Object} Dashboard statistics including:
 *   - userMetrics: { totalUsers, newUsers, activeUsers, growth }
 *   - driverMetrics: { totalDrivers, onlineDrivers, pendingVerification, growth }
 *   - rideMetrics: { totalRides, completedRides, cancelledRides, revenue }
 *   - financialMetrics: { totalRevenue, pendingPayouts, monthlyRevenue }
 *   - systemMetrics: { serverUptime, avgResponseTime, errorRate }
 * 
 * @example
 * GET /api/v1/admin/dashboard
 * Response: { success: true, data: { ... } }
 */
router.get(
  '/dashboard',
  cacheMiddleware({ ttl: 60 }), // Cache for 1 minute
  adminController.getDashboardStats
);

router.get('/overview/stats', cacheMiddleware({ ttl: 60 }), adminController.getOverviewStats);
router.get('/activities', adminController.getRecentActivities);
router.get('/rides/upcoming', adminController.getUpcomingRides);
router.get('/system/alerts', adminController.getSystemAlerts);
router.patch('/system/alerts/:id/read', (req, res) => res.json({ success: true, data: { id: req.params.id, read: true } }));
router.delete('/system/alerts/:id', (req, res) => res.json({ success: true, data: { id: req.params.id, dismissed: true } }));
router.get('/platform/metrics', cacheMiddleware({ ttl: 300 }), adminController.getPlatformMetrics);
router.get('/drivers/top', adminController.getTopDrivers);
router.get('/routes/popular', adminController.getPopularRoutes);
router.get('/analytics/payments', adminController.getPaymentAnalytics);
router.get('/analytics/user-growth', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/ride-distribution', adminController.getRideDistribution);
router.get('/analytics/hourly-activity', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/weekly-trend', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/monthly-trend', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/devices', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/location-heatmap', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/promotions', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/drivers', (req, res) => res.json({ success: true, data: [] }));
router.get('/analytics/rider-retention', (req, res) => res.json({ success: true, data: [] }));
router.get('/live-operations', adminController.getLiveOperations);
router.get('/verifications', adminController.getVerifications);
router.patch('/verifications/:id/approve', adminController.approveVerification);
router.patch('/verifications/:id/reject', adminController.rejectVerification);
router.delete('/verifications/:id', adminController.deleteVerification);

// =============================================================================
// USER MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/admin/users
 * @description List all users with filtering and pagination
 * @access Admin only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [search] - Search by name or email
 * @queryParam {string} [role] - Filter by role (user, driver, admin)
 * @queryParam {string} [status] - Filter by status (active, suspended, pending)
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order (asc/desc)
 * 
 * @returns {Object} Paginated list of users
 * 
 * @example
 * GET /api/v1/admin/users?page=1&limit=20&role=driver&status=active
 */
router.get(
  '/users',
  pagination({ defaultLimit: 20, maxLimit: 100 }),
  adminController.getAllUsers
);

router.post(
  '/users',
  adminController.createUserByAdmin
);

/**
 * @route GET /api/v1/admin/users/:id
 * @description Get detailed user profile by ID
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @returns {Object} User profile with full details
 * 
 * @example
 * GET /api/v1/admin/users/usr_123456
 * Response: { success: true, data: { ...userDetails } }
 */
router.get(
  '/users/:id',
  validate(adminValidation.getUserById),
  userController.getProfile
);

/**
 * @route PATCH /api/v1/admin/users/:id
 * @description Update user profile (admin override)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @body {Object} updates - Fields to update
 * @body {string} [updates.name] - User's full name
 * @body {string} [updates.email] - User's email
 * @body {string} [updates.role] - User's role (user/driver/admin)
 * @body {string} [updates.status] - User's status (active/suspended/pending)
 * @body {Object} [updates.metadata] - Additional metadata
 * 
 * @returns {Object} Updated user profile
 * 
 * @example
 * PATCH /api/v1/admin/users/usr_123456
 * Body: { "status": "suspended", "metadata": { "suspensionReason": "Terms violation" } }
 */
router.patch(
  '/users/:id',
  validate(adminValidation.updateUserByAdmin),
  adminController.updateUserByAdmin
);

router.put(
  '/users/:id',
  validate(adminValidation.updateUserByAdmin),
  adminController.updateUserByAdmin
);

router.patch(
  '/users/bulk/status',
  adminController.bulkUpdateUserStatusByAdmin
);

router.patch(
  '/users/:id/status',
  adminController.updateUserStatusByAdmin
);

/**
 * @route DELETE /api/v1/admin/users/:id
 * @description Delete user account (admin override)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @body {string} [reason] - Reason for deletion
 * 
 * @returns {Object} Success confirmation
 * 
 * @example
 * DELETE /api/v1/admin/users/usr_123456
 * Body: { "reason": "Account closure requested" }
 */
router.delete(
  '/users/:id',
  validate(adminValidation.deleteUser),
  adminController.deleteUser
);

// =============================================================================
// DRIVER MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/admin/drivers
 * @description List all drivers with filtering and pagination
 * @access Admin only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status (online, offline, pending)
 * @queryParam {string} [verificationStatus] - Filter by verification (verified, pending, rejected)
 * @queryParam {string} [search] - Search by name, email, or license
 * @queryParam {string} [vehicleType] - Filter by vehicle type
 * 
 * @returns {Object} Paginated list of drivers
 * 
 * @example
 * GET /api/v1/admin/drivers?status=online&verificationStatus=verified
 */
router.get(
  '/drivers',
  pagination({ defaultLimit: 20, maxLimit: 100 }),
  driverController.listDrivers
);

router.post(
  '/drivers',
  adminController.createDriverByAdmin
);

router.get(
  '/drivers/stats',
  adminController.getDriverStats
);

router.get(
  '/drivers/export',
  adminController.exportDrivers
);

/**
 * @route GET /api/v1/admin/drivers/:id
 * @description Get detailed driver profile
 * @access Admin only
 * 
 * @param {string} id - Driver ID
 * @returns {Object} Driver profile with vehicle and performance data
 * 
 * @example
 * GET /api/v1/admin/drivers/drv_123456
 */
router.get(
  '/drivers/:id',
  validate(adminValidation.getDriverById),
  driverController.getDriverProfile
);

router.put(
  '/drivers/:id',
  adminController.updateDriverByAdmin
);

router.delete(
  '/drivers/:id',
  adminController.deleteDriverByAdmin
);

/**
 * @route PATCH /api/v1/admin/drivers/:id/status
 * @description Update driver status (online/offline) - Admin override
 * @access Admin only
 * 
 * @param {string} id - Driver ID
 * @body {string} status - Status to set (online/offline/suspended)
 * @body {string} [reason] - Reason for status change
 * 
 * @returns {Object} Updated driver status
 * 
 * @example
 * PATCH /api/v1/admin/drivers/drv_123456/status
 * Body: { "status": "suspended", "reason": "Fraud investigation" }
 */
router.patch(
  '/drivers/:id/status',
  validate(adminValidation.updateDriverStatus),
  adminController.updateDriverStatusByAdmin
);

/**
 * @route PATCH /api/v1/admin/drivers/:id/verify
 * @description Verify or reject driver
 * @access Admin only
 * 
 * @param {string} id - Driver ID
 * @body {string} status - Verification status (verified/rejected)
 * @body {string} [reason] - Rejection reason if status is rejected
 * 
 * @returns {Object} Updated driver verification status
 * 
 * @example
 * PATCH /api/v1/admin/drivers/drv_123456/verify
 * Body: { "status": "verified" }
 */
router.patch(
  '/drivers/:id/verify',
  validate(adminValidation.verifyDriver),
  adminController.verifyDriverByAdmin
);

/**
 * @route GET /api/v1/admin/drivers/:id/performance
 * @description Get driver performance metrics
 * @access Admin only
 * 
 * @param {string} id - Driver ID
 * @queryParam {string} [period=month] - Time period (day/week/month/year)
 * 
 * @returns {Object} Performance metrics
 * 
 * @example
 * GET /api/v1/admin/drivers/drv_123456/performance?period=week
 */
router.get(
  '/drivers/:id/performance',
  validate(adminValidation.getDriverPerformance),
  adminController.getDriverPerformance
);

router.get(
  '/system/settings',
  adminController.getSystemSettings
);

router.put(
  '/system/settings',
  adminController.updateSystemSettings
);

// =============================================================================
// SYSTEM ADMINISTRATION
// =============================================================================

/**
 * @route GET /api/v1/admin/system/health
 * @description Get system health status
 * @access Admin only
 * 
 * @returns {Object} System health status including:
 *   - database: connection status
 *   - redis: connection status
 *   - queue: message queue status
 *   - services: external service status
 * 
 * @example
 * GET /api/v1/admin/system/health
 */
router.get(
  '/system/health',
  adminController.getSystemHealth
);

router.get(
  '/rides',
  pagination({ defaultLimit: 20, maxLimit: 100 }),
  adminController.getRides
);

router.delete(
  '/rides/:id',
  adminController.deleteRideByAdmin
);

router.get('/payments', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getPayments);
router.get('/vehicles', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getVehicles);
router.delete('/vehicles/:id', adminController.deleteVehicleByAdmin);
router.get('/fleets', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getFleets);
router.get('/reviews', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getReviews);
router.patch('/reviews/:id/approve', (req, res) => res.json({ success: true, data: { id: req.params.id, status: 'approved' } }));
router.patch('/reviews/:id/reject', (req, res) => res.json({ success: true, data: { id: req.params.id, status: 'rejected' } }));
router.delete('/reviews/:id', (req, res) => res.json({ success: true, data: { id: req.params.id, deleted: true } }));
router.get('/promotions', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getPromotions);
router.get('/incidents', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getIncidents);
router.get('/support', pagination({ defaultLimit: 20, maxLimit: 100 }), adminController.getSupportTickets);
router.get('/support/assignees', (req, res) => res.json({ success: true, data: [] }));
router.get('/zones', adminController.getAllZones);
router.post('/zones', adminController.createZone);
router.delete('/zones/:id', adminController.deleteZone);

/**
 * @route GET /api/v1/admin/system/metrics
 * @description Get system performance metrics
 * @access Admin only
 * 
 * @queryParam {string} [period=day] - Time period (hour/day/week)
 * @returns {Object} System metrics
 * 
 * @example
 * GET /api/v1/admin/system/metrics?period=day
 */
router.get(
  '/system/metrics',
  cacheMiddleware({ ttl: 300 }), // Cache for 5 minutes
  adminController.getSystemMetrics
);

// =============================================================================
// AUDIT & COMPLIANCE
// =============================================================================

/**
 * @route GET /api/v1/admin/audit-logs
 * @description Get audit logs with filtering
 * @access Admin only
 * 
 * @queryParam {string} [action] - Filter by action type
 * @queryParam {string} [userId] - Filter by user ID
 * @queryParam {string} [startDate] - Start date (ISO format)
 * @queryParam {string} [endDate] - End date (ISO format)
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=50] - Items per page
 * 
 * @returns {Object} Paginated audit logs
 * 
 * @example
 * GET /api/v1/admin/audit-logs?action=USER_UPDATE&startDate=2024-01-01
 */
router.get(
  '/audit-logs',
  pagination({ defaultLimit: 50, maxLimit: 200 }),
  adminController.getAuditLogs
);

/**
 * @route GET /api/v1/admin/audit-logs/export
 * @description Export audit logs as CSV
 * @access Admin only
 * 
 * @queryParam {string} [startDate] - Start date (ISO format)
 * @queryParam {string} [endDate] - End date (ISO format)
 * @queryParam {string} [format=csv] - Export format (csv/json)
 * 
 * @returns {File} CSV or JSON file
 * 
 * @example
 * GET /api/v1/admin/audit-logs/export?startDate=2024-01-01&endDate=2024-12-31
 */
router.get(
  '/audit-logs/export',
  adminController.exportAuditLogs
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/admin/health
 * @description Health check for admin routes
 * @access Public (internal)
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/admin/health
 * Response: { status: 'healthy', endpoint: '/api/v1/admin', timestamp: '2024-...' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/admin',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
