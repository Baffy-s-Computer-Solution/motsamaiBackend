/**
 * User Routes
 * Version: 3.0.0
 * Description: User management and profile endpoints
 * 
 * @module routes/v1/userRoutes
 * @requires express
 * @requires controllers/userController
 * @requires controllers/authController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/user.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    endpoint: '/api/v1/users',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Controllers
const userController = require('../../controllers/userController');
const authController = require('../../controllers/authController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const userValidation = require('../../middleware/user.validation');
const authValidation = require('../../middleware/auth.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

// =============================================================================
// PUBLIC ROUTES (Authentication)
// =============================================================================

/**
 * @route POST /api/v1/users/register
 * @description Register a new user
 * @access Public
 * @rateLimit 5 requests per minute per IP
 * 
 * @body {string} email - User's email address
 * @body {string} password - User's password (min 8 chars with complexity)
 * @body {string} name - User's full name
 * @body {string} [phone] - User's phone number
 * @body {string} [role=user] - User role (user/driver/admin)
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} User account details and JWT tokens
 * 
 * @example
 * POST /api/v1/users/register
 * Body: { "email": "user@example.com", "password": "Secure123!", "name": "John Doe" }
 */
router.post(
  '/register',
  requestLogger,
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many registration attempts, please try again later'
  }),
  validate(authValidation.register),
  authController.register
);

/**
 * @route POST /api/v1/users/login
 * @description Login user
 * @access Public
 * @rateLimit 10 requests per minute per IP
 * 
 * @body {string} email - User's email address
 * @body {string} password - User's password
 * @body {string} [deviceId] - Device identifier
 * @body {string} [deviceName] - Device name
 * 
 * @returns {Object} Session details and JWT tokens
 * 
 * @example
 * POST /api/v1/users/login
 * Body: { "email": "user@example.com", "password": "Secure123!" }
 */
router.post(
  '/login',
  requestLogger,
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many login attempts, please try again later'
  }),
  validate(authValidation.login),
  authController.login
);

/**
 * @route POST /api/v1/users/logout
 * @description Logout user
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} [refreshToken] - Refresh token to invalidate
 * 
 * @returns {Object} Logout confirmation
 * 
 * @example
 * POST /api/v1/users/logout
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.post(
  '/logout',
  auth,
  authController.logout
);

// =============================================================================
// PROTECTED ROUTES (Require Authentication)
// =============================================================================

/**
 * Apply authentication to all routes below
 */
router.use((req, res, next) => {
  if (req.path === '/health') return next();
  return auth(req, res, next);
}, requestLogger);

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/users/profile
 * @description Get current user's profile
 * @access User only
 * @cache 30 seconds
 * 
 * @returns {Object} User profile with all details
 * 
 * @example
 * GET /api/v1/users/profile
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: { "success": true, "data": { ...userProfile } }
 */
router.get(
  '/profile',
  cacheMiddleware({ ttl: 30 }),
  userController.getProfile
);

/**
 * @route PUT /api/v1/users/profile
 * @description Update user profile
 * @access User only
 * 
 * @body {string} [name] - User's full name
 * @body {string} [phone] - User's phone number
 * @body {string} [preferredLanguage] - Preferred language
 * @body {Object} [preferences] - User preferences
 * @body {Object} [settings] - User settings
 * 
 * @returns {Object} Updated profile
 * 
 * @example
 * PUT /api/v1/users/profile
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "name": "John Doe Jr.", "preferredLanguage": "en" }
 */
router.put(
  '/profile',
  validate(userValidation.updateProfile),
  userController.updateProfile
);

router.get(
  '/stats',
  userController.getUserStats
);

router.get(
  '/activity',
  userController.getActivity
);

router.post(
  '/avatar',
  userController.updateAvatarMetadata
);

router.delete(
  '/avatar',
  userController.updateAvatarMetadata
);

router.get(
  '/sessions',
  userController.getSessions
);

router.delete(
  '/sessions',
  userController.logoutAllDevices
);

router.delete(
  '/sessions/:id',
  userController.revokeSession
);

router.get(
  '/referrals',
  userController.getReferralInfo
);

router.get(
  '/referrals/stats',
  userController.getReferralStats
);

router.get(
  '/referrals/list',
  userController.getReferrals
);

router.post(
  '/referrals/code',
  userController.createReferralCode
);

/**
 * @route DELETE /api/v1/users/profile
 * @description Delete user account
 * @access User only
 * 
 * @body {string} [reason] - Account deletion reason
 * @body {string} [password] - Password confirmation
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/users/profile
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "No longer needed", "password": "CurrentPassword123!" }
 */
router.delete(
  '/profile',
  validate(userValidation.deleteAccount),
  userController.deleteAccount
);

// =============================================================================
// PASSWORD MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/users/change-password
 * @description Change user password
 * @access User only
 * 
 * @body {string} currentPassword - Current password
 * @body {string} newPassword - New password
 * @body {string} [confirmPassword] - Confirm new password
 * 
 * @returns {Object} Password change confirmation
 * 
 * @example
 * POST /api/v1/users/change-password
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "currentPassword": "Old123!", "newPassword": "New123!" }
 */
router.post(
  '/change-password',
  validate(userValidation.changePassword),
  userController.changePassword
);

/**
 * @route POST /api/v1/users/forgot-password
 * @description Request password reset
 * @access Public
 * 
 * @body {string} email - User's email address
 * 
 * @returns {Object} Reset request confirmation
 * 
 * @example
 * POST /api/v1/users/forgot-password
 * Body: { "email": "user@example.com" }
 */
router.post(
  '/forgot-password',
  rateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset requests'
  }),
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);

/**
 * @route POST /api/v1/users/reset-password
 * @description Reset password with token
 * @access Public
 * 
 * @body {string} token - Reset token
 * @body {string} newPassword - New password
 * 
 * @returns {Object} Password reset confirmation
 * 
 * @example
 * POST /api/v1/users/reset-password
 * Body: { "token": "...", "newPassword": "NewSecure123!" }
 */
router.post(
  '/reset-password',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many password reset attempts'
  }),
  validate(authValidation.resetPassword),
  authController.resetPassword
);

// =============================================================================
// RIDE & PAYMENT HISTORY
// =============================================================================

/**
 * @route GET /api/v1/users/rides
 * @description Get user's ride history
 * @access User only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated ride history
 * 
 * @example
 * GET /api/v1/users/rides?page=1&status=completed
 */
router.get(
  '/rides',
  validate(userValidation.getRideHistory),
  userController.getRideHistory
);

/**
 * @route GET /api/v1/users/payments
 * @description Get user's payment history
 * @access User only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [type] - Payment type
 * 
 * @returns {Object} Paginated payment history
 * 
 * @example
 * GET /api/v1/users/payments?page=1&status=completed
 */
router.get(
  '/payments',
  validate(userValidation.getPaymentHistory),
  userController.getPaymentHistory
);

// =============================================================================
// NOTIFICATIONS
// =============================================================================

/**
 * @route GET /api/v1/users/notifications
 * @description Get user's notifications
 * @access User only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {boolean} [unreadOnly] - Only unread notifications
 * 
 * @returns {Object} Paginated notifications
 * 
 * @example
 * GET /api/v1/users/notifications?unreadOnly=true
 */
router.get(
  '/notifications',
  validate(userValidation.getNotifications),
  userController.getNotifications
);

/**
 * @route PATCH /api/v1/users/notifications/:id/read
 * @description Mark notification as read
 * @access User only
 * 
 * @param {string} id - Notification ID
 * @returns {Object} Updated notification
 * 
 * @example
 * PATCH /api/v1/users/notifications/not_123/read
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.patch(
  '/notifications/:id/read',
  validate(userValidation.markNotificationRead),
  userController.markNotificationRead
);

/**
 * @route PUT /api/v1/users/notifications/preferences
 * @description Update notification preferences
 * @access User only
 * 
 * @body {Object} preferences - Notification preferences
 * 
 * @returns {Object} Updated preferences
 * 
 * @example
 * PUT /api/v1/users/notifications/preferences
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "preferences": { "email": true, "push": false } }
 */
router.put(
  '/notifications/preferences',
  validate(userValidation.updateNotificationPreferences),
  userController.updateNotificationPreferences
);

// =============================================================================
// DEVICE MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/users/devices
 * @description Register a new device
 * @access User only
 * 
 * @body {string} deviceId - Device identifier
 * @body {string} deviceName - Device name
 * @body {string} [deviceType] - Device type (ios/android/web)
 * @body {string} [pushToken] - Push notification token
 * 
 * @returns {Object} Registered device
 * 
 * @example
 * POST /api/v1/users/devices
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "deviceId": "dev_123", "deviceName": "iPhone 15", "pushToken": "..." }
 */
router.post(
  '/devices',
  validate(userValidation.registerDevice),
  userController.registerDevice
);

/**
 * @route DELETE /api/v1/users/devices/:deviceId
 * @description Remove a device
 * @access User only
 * 
 * @param {string} deviceId - Device ID
 * @returns {Object} Removal confirmation
 * 
 * @example
 * DELETE /api/v1/users/devices/dev_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/devices/:deviceId',
  validate(userValidation.removeDevice),
  userController.removeDevice
);

// =============================================================================
// SAVED PLACES
// =============================================================================

/**
 * @route GET /api/v1/users/saved-places
 * @description Get user's saved places
 * @access User only
 * 
 * @returns {Object} List of saved places
 * 
 * @example
 * GET /api/v1/users/saved-places
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/saved-places',
  cacheMiddleware({ ttl: 60 }),
  userController.getSavedPlaces
);

/**
 * @route POST /api/v1/users/saved-places
 * @description Save a place
 * @access User only
 * 
 * @body {string} name - Place name
 * @body {number} latitude - Latitude
 * @body {number} longitude - Longitude
 * @body {string} [address] - Place address
 * @body {string} [type] - Place type (home/work/other)
 * 
 * @returns {Object} Saved place
 * 
 * @example
 * POST /api/v1/users/saved-places
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "name": "Home", "latitude": 34.05, "longitude": -118.25, "type": "home" }
 */
router.post(
  '/saved-places',
  validate(userValidation.savePlace),
  userController.savePlace
);

/**
 * @route PUT /api/v1/users/saved-places/:id
 * @description Update a saved place
 * @access User only
 * 
 * @param {string} id - Saved place ID
 * @body {Object} updates - Fields to update
 * 
 * @returns {Object} Updated place
 * 
 * @example
 * PUT /api/v1/users/saved-places/place_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "name": "Work", "address": "456 Office St" }
 */
router.put(
  '/saved-places/:id',
  validate(userValidation.updateSavedPlace),
  userController.updateSavedPlace
);

/**
 * @route DELETE /api/v1/users/saved-places/:id
 * @description Delete a saved place
 * @access User only
 * 
 * @param {string} id - Saved place ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/users/saved-places/place_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/saved-places/:id',
  validate(userValidation.deleteSavedPlace),
  userController.deleteSavedPlace
);

router.patch(
  '/saved-places/:id/default',
  userController.setDefaultSavedPlace
);

// =============================================================================
// ADMIN ROUTES (Require Admin Role)
// =============================================================================

/**
 * Apply admin authorization to all routes below
 */
router.use(authorizeRoles('admin'));

/**
 * @route GET /api/v1/users
 * @description Get all users (admin only)
 * @access Admin only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [search] - Search by name or email
 * @queryParam {string} [role] - Filter by role
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [sortBy] - Sort field
 * @queryParam {string} [sortOrder] - Sort order (asc/desc)
 * 
 * @returns {Object} Paginated user list
 * 
 * @example
 * GET /api/v1/users?page=1&role=driver&status=active
 */
router.get(
  '/',
  validate(userValidation.listUsers),
  userController.getAllUsers
);

/**
 * @route GET /api/v1/users/:id
 * @description Get user by ID (admin only)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @returns {Object} User details
 * 
 * @example
 * GET /api/v1/users/usr_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  validate(userValidation.getUserById),
  userController.getUserById
);

/**
 * @route PATCH /api/v1/users/:id/suspend
 * @description Suspend a user (admin only)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @body {string} reason - Suspension reason
 * @body {number} [duration] - Suspension duration in days
 * 
 * @returns {Object} Updated user status
 * 
 * @example
 * PATCH /api/v1/users/usr_123/suspend
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Terms violation", "duration": 30 }
 */
router.patch(
  '/:id/suspend',
  validate(userValidation.suspendUser),
  userController.suspendUser
);

/**
 * @route PATCH /api/v1/users/:id/activate
 * @description Activate a user (admin only)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @returns {Object} Updated user status
 * 
 * @example
 * PATCH /api/v1/users/usr_123/activate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.patch(
  '/:id/activate',
  validate(userValidation.activateUser),
  userController.activateUser
);

/**
 * @route PATCH /api/v1/users/:id/role
 * @description Update user role (admin only)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @body {string} role - New role (user/driver/admin)
 * 
 * @returns {Object} Updated user with new role
 * 
 * @example
 * PATCH /api/v1/users/usr_123/role
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "role": "admin" }
 */
router.patch(
  '/:id/role',
  validate(userValidation.updateUserRole),
  userController.updateUserRole
);

/**
 * @route GET /api/v1/users/:id/audit-logs
 * @description Get user's audit logs (admin only)
 * @access Admin only
 * 
 * @param {string} id - User ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [action] - Filter by action
 * 
 * @returns {Object} Paginated audit logs
 * 
 * @example
 * GET /api/v1/users/usr_123/audit-logs?page=1
 */
router.get(
  '/:id/audit-logs',
  validate(userValidation.getUserAuditLogs),
  userController.getUserAuditLogs
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/users/health
 * @description Health check for user routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/users/health
 * Response: { status: 'healthy', endpoint: '/api/v1/users', version: '3.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/users',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    services: {
      userManagement: 'operational',
      authentication: 'operational',
      adminOperations: 'operational'
    }
  });
});

module.exports = router;
