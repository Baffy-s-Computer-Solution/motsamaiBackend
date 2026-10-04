/**
 * Notification Routes
 * Version: 2.0.0
 * Description: Notification management endpoints
 * 
 * @module routes/v1/notificationRoutes
 * @requires express
 * @requires controllers/notificationController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/notification.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const notificationController = require('../../controllers/notificationController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const notificationValidation = require('../../middleware/notification.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all notification routes
 */
router.use(auth, requestLogger);

// =============================================================================
// NOTIFICATION RETRIEVAL
// =============================================================================

/**
 * @route GET /api/v1/notifications
 * @description Get user's notifications
 * @access All authenticated users
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [type] - Filter by notification type
 * @queryParam {string} [priority] - Filter by priority
 * @queryParam {boolean} [unreadOnly] - Only unread notifications
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated notification list
 * 
 * @example
 * GET /api/v1/notifications?page=1&unreadOnly=true&limit=10
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "success": true,
 *   "data": {
 *     "notifications": [...],
 *     "pagination": { "page": 1, "limit": 10, "total": 25, "pages": 3 },
 *     "unreadCount": 5
 *   }
 * }
 */
router.get(
  '/',
  validate(notificationValidation.listNotifications),
  cacheMiddleware({ ttl: 15 }),
  notificationController.list
);

/**
 * @route GET /api/v1/notifications/count/unread
 * @description Get unread notification count
 * @access All authenticated users
 * @cache 10 seconds
 * 
 * @returns {Object} Unread count
 * 
 * @example
 * GET /api/v1/notifications/count/unread
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: { "success": true, "data": { "unreadCount": 5 } }
 */
router.get(
  '/count/unread',
  cacheMiddleware({ ttl: 10 }),
  notificationController.getUnreadCount
);

router.get(
  '/preferences',
  cacheMiddleware({ ttl: 60 }),
  notificationController.getPreferences
);

router.put(
  '/preferences',
  validate(notificationValidation.updatePreferences),
  notificationController.updatePreferences
);

router.put(
  '/read-all',
  validate(notificationValidation.markAllAsRead),
  notificationController.markAllAsRead
);

router.delete(
  '/',
  notificationController.deleteAll
);

router.delete(
  '/:id',
  validate(notificationValidation.getNotificationById),
  notificationController.deleteNotification
);

/**
 * @route GET /api/v1/notifications/:id
 * @description Get notification details
 * @access All authenticated users
 * 
 * @param {string} id - Notification ID
 * @returns {Object} Notification details
 * 
 * @example
 * GET /api/v1/notifications/not_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  validate(notificationValidation.getNotificationById),
  notificationController.getNotificationById
);

// =============================================================================
// NOTIFICATION STATUS UPDATES
// =============================================================================

/**
 * @route PATCH /api/v1/notifications/:id/read
 * @description Mark notification as read
 * @access All authenticated users
 * 
 * @param {string} id - Notification ID
 * @returns {Object} Updated notification
 * 
 * @example
 * PATCH /api/v1/notifications/not_123/read
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: { "success": true, "data": { "read": true, "readAt": "2024-01-15T10:30:00Z" } }
 */
router.patch(
  '/:id/read',
  validate(notificationValidation.markAsRead),
  notificationController.markAsRead
);

router.put(
  '/:id/read',
  validate(notificationValidation.markAsRead),
  notificationController.markAsRead
);

/**
 * @route PATCH /api/v1/notifications/read-all
 * @description Mark all notifications as read
 * @access All authenticated users
 * 
 * @body {string} [type] - Optional notification type filter
 * 
 * @returns {Object} Update confirmation
 * 
 * @example
 * PATCH /api/v1/notifications/read-all
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "type": "ride" }
 */
router.patch(
  '/read-all',
  validate(notificationValidation.markAllAsRead),
  notificationController.markAllAsRead
);

/**
 * @route PATCH /api/v1/notifications/:id/dismiss
 * @description Dismiss notification
 * @access All authenticated users
 * 
 * @param {string} id - Notification ID
 * @returns {Object} Dismissal confirmation
 * 
 * @example
 * PATCH /api/v1/notifications/not_123/dismiss
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.patch(
  '/:id/dismiss',
  validate(notificationValidation.dismissNotification),
  notificationController.dismiss
);

// =============================================================================
// NOTIFICATION PREFERENCES
// =============================================================================

/**
 * @route GET /api/v1/notifications/preferences
 * @description Get notification preferences
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @returns {Object} Notification preferences
 * 
 * @example
 * GET /api/v1/notifications/preferences
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "success": true,
 *   "data": {
 *     "channels": { "email": true, "push": true, "sms": false },
 *     "types": { "ride": true, "promotion": true, "system": false }
 *   }
 * }
 */
router.get(
  '/preferences',
  cacheMiddleware({ ttl: 60 }),
  notificationController.getPreferences
);

/**
 * @route PUT /api/v1/notifications/preferences
 * @description Update notification preferences
 * @access All authenticated users
 * 
 * @body {Object} preferences - Updated preferences
 * @body {Object} [preferences.channels] - Channel preferences
 * @body {Object} [preferences.types] - Notification type preferences
 * @body {Object} [preferences.schedule] - Do not disturb schedule
 * 
 * @returns {Object} Updated preferences
 * 
 * @example
 * PUT /api/v1/notifications/preferences
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "preferences": {
 *     "channels": { "email": true, "push": false },
 *     "types": { "promotion": false },
 *     "schedule": { "start": "22:00", "end": "08:00", "timezone": "America/New_York" }
 *   }
 * }
 */
router.put(
  '/preferences',
  validate(notificationValidation.updatePreferences),
  notificationController.updatePreferences
);

// =============================================================================
// ADMIN NOTIFICATION MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/notifications/send
 * @description Send notification to users (admin only)
 * @access Admin only
 * @rateLimit 10 requests per minute per user
 * 
 * @body {string} title - Notification title
 * @body {string} body - Notification body
 * @body {string} type - Notification type
 * @body {string} priority - Priority level (low/medium/high/urgent)
 * @body {string[]} [recipients] - Specific user IDs (optional)
 * @body {string[]} [roles] - Target user roles (optional)
 * @body {Object} [data] - Additional data payload
 * @body {Object} [schedule] - Scheduled delivery
 * @body {string} schedule.deliveryTime - Scheduled delivery time
 * 
 * @returns {Object} Send confirmation with tracking ID
 * 
 * @example
 * POST /api/v1/notifications/send
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "title": "Ride Promotion",
 *   "body": "Get 20% off your next ride!",
 *   "type": "promotion",
 *   "priority": "medium",
 *   "roles": ["rider"],
 *   "data": { "promotionCode": "RIDE20" }
 * }
 */
router.post(
  '/send',
  authorizeRoles('admin'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many send attempts, please slow down'
  }),
  validate(notificationValidation.sendNotification),
  notificationController.send
);

/**
 * @route POST /api/v1/notifications/template
 * @description Send notification using template (admin only)
 * @access Admin only
 * 
 * @body {string} templateId - Template ID
 * @body {Object} variables - Template variables
 * @body {string[]} [recipients] - Specific user IDs
 * @body {string[]} [roles] - Target user roles
 * 
 * @returns {Object} Send confirmation
 * 
 * @example
 * POST /api/v1/notifications/template
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "templateId": "promotion_ride",
 *   "variables": { "discount": "20%", "code": "RIDE20" },
 *   "roles": ["rider"]
 * }
 */
router.post(
  '/template',
  authorizeRoles('admin'),
  validate(notificationValidation.sendTemplateNotification),
  notificationController.sendTemplate
);

/**
 * @route GET /api/v1/notifications/templates
 * @description Get available notification templates
 * @access Admin only
 * @cache 1 hour
 * 
 * @returns {Object} List of templates
 * 
 * @example
 * GET /api/v1/notifications/templates
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/templates',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 3600 }),
  notificationController.getTemplates
);

// =============================================================================
// NOTIFICATION ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/notifications/statistics
 * @description Get notification statistics (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [type] - Filter by notification type
 * 
 * @returns {Object} Notification statistics
 * 
 * @example
 * GET /api/v1/notifications/statistics?period=week&type=promotion
 */
router.get(
  '/statistics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(notificationValidation.getStatistics),
  notificationController.getStatistics
);

/**
 * @route GET /api/v1/notifications/analytics
 * @description Get notification analytics (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Analytics period
 * @queryParam {string} [metric] - Specific metric to retrieve
 * 
 * @returns {Object} Analytics data
 * 
 * @example
 * GET /api/v1/notifications/analytics?period=month&metric=openRate
 */
router.get(
  '/analytics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(notificationValidation.getAnalytics),
  notificationController.getAnalytics
);

// =============================================================================
// PUSH NOTIFICATIONS
// =============================================================================

/**
 * @route POST /api/v1/notifications/push/register
 * @description Register push notification token
 * @access All authenticated users
 * 
 * @body {string} token - Push notification token
 * @body {string} platform - Platform (ios/android/web)
 * @body {string} [deviceId] - Device identifier
 * 
 * @returns {Object} Registration confirmation
 * 
 * @example
 * POST /api/v1/notifications/push/register
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "token": "push_token_123", "platform": "ios" }
 */
router.post(
  '/push/register',
  validate(notificationValidation.registerPushToken),
  notificationController.registerPushToken
);

/**
 * @route DELETE /api/v1/notifications/push/unregister
 * @description Unregister push notification token
 * @access All authenticated users
 * 
 * @body {string} token - Push notification token
 * @body {string} [deviceId] - Device identifier
 * 
 * @returns {Object} Unregistration confirmation
 * 
 * @example
 * DELETE /api/v1/notifications/push/unregister
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "token": "push_token_123" }
 */
router.delete(
  '/push/unregister',
  validate(notificationValidation.unregisterPushToken),
  notificationController.unregisterPushToken
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/notifications/health
 * @description Health check for notification routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/notifications/health
 * Response: { status: 'healthy', endpoint: '/api/v1/notifications', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/notifications',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      notificationManagement: 'operational',
      pushNotifications: 'operational'
    }
  });
});

module.exports = router;
