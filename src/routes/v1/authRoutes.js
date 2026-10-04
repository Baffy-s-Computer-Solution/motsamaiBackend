/**
 * Authentication Routes
 * Version: 3.0.0
 * Description: Authentication and authorization endpoints
 * 
 * @module routes/v1/authRoutes
 * @requires express
 * @requires controllers/authController
 * @requires middleware/validate
 * @requires middleware/auth.validation
 * @requires middleware/rateLimiter
 * @requires middleware/security
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const authController = require('../../controllers/authController');

// Middleware
const validate = require('../../middleware/validate');
const authValidation = require('../../middleware/auth.validation');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { securityHeaders } = require('../../middleware/security');
const { requestLogger } = require('../../middleware/requestLogger');
const { verifyGoogleTokenMiddleware } = require('../../middleware/googleAuth');
const { auth } = require('../../middleware/auth');

// =============================================================================
// PUBLIC AUTHENTICATION ROUTES
// =============================================================================

/**
 * @route POST /api/v1/auth/register
 * @description Register a new user account
 * @access Public
 * @rateLimit 5 requests per minute per IP
 * 
 * @body {string} email - User's email address
 * @body {string} password - User's password (min 8 chars with complexity)
 * @body {string} name - User's full name
 * @body {string} [phone] - User's phone number
 * @body {string} [role=user] - User role (user/driver)
 * @body {Object} [metadata] - Additional user metadata
 * 
 * @returns {Object} User account details and JWT tokens
 * 
 * @example
 * POST /api/v1/auth/register
 * Body: {
 *   "email": "user@example.com",
 *   "password": "SecurePassword123!",
 *   "name": "John Doe",
 *   "phone": "+1234567890"
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "user": { ... },
 *     "tokens": { "accessToken": "...", "refreshToken": "..." }
 *   }
 * }
 */
router.post(
  '/register',
  requestLogger,
  securityHeaders,
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Too many registration attempts, please try again later'
  }),
  validate(authValidation.register),
  authController.register
);

/**
 * @route POST /api/v1/auth/login
 * @description Authenticate user and issue JWT tokens
 * @access Public
 * @rateLimit 10 requests per minute per IP
 * 
 * @body {string} email - User's email address
 * @body {string} password - User's password
 * @body {string} [deviceId] - Device identifier for session tracking
 * @body {string} [deviceName] - Device name for session tracking
 * 
 * @returns {Object} User session details and JWT tokens
 * 
 * @example
 * POST /api/v1/auth/login
 * Body: { "email": "user@example.com", "password": "SecurePassword123!" }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "user": { ... },
 *     "tokens": { "accessToken": "...", "refreshToken": "..." },
 *     "session": { "id": "...", "expiresAt": "..." }
 *   }
 * }
 */
router.post(
  '/login',
  requestLogger,
  securityHeaders,
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many login attempts, please try again later'
  }),
  validate(authValidation.login),
  authController.login
);

router.post(
  '/complete-biometric-login',
  requestLogger,
  securityHeaders,
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many biometric login attempts, please try again later'
  }),
  authController.completeBiometricLogin
);

/**
 * @route POST /api/v1/auth/logout
 * @description Logout user and invalidate session
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} [refreshToken] - Refresh token to invalidate
 * @body {string} [deviceId] - Device identifier
 * 
 * @returns {Object} Logout confirmation
 * 
 * @example
 * POST /api/v1/auth/logout
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "refreshToken": "..." }
 */
router.post(
  '/logout',
  auth,
  authController.logout
);

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/auth/refresh
 * @description Refresh access token using refresh token
 * @access Public (with refresh token)
 * 
 * @body {string} refreshToken - Valid refresh token
 * 
 * @returns {Object} New access and refresh tokens
 * 
 * @example
 * POST /api/v1/auth/refresh
 * Body: { "refreshToken": "..." }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "accessToken": "...",
 *     "refreshToken": "...",
 *     "expiresIn": 3600
 *   }
 * }
 */
router.post(
  '/refresh',
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: 'Too many refresh attempts, please try again later'
  }),
  validate(authValidation.refreshToken),
  authController.refreshToken
);

router.post(
  '/refresh-token',
  rateLimiter({ windowMs: 60 * 1000, max: 20 }),
  validate(authValidation.refreshToken),
  authController.refreshToken
);

/**
 * @route POST /api/v1/auth/revoke
 * @description Revoke refresh token (logout all sessions)
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} [refreshToken] - Specific token to revoke
 * 
 * @returns {Object} Revocation confirmation
 * 
 * @example
 * POST /api/v1/auth/revoke
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.post(
  '/revoke',
  authController.revokeToken
);

// =============================================================================
// PASSWORD MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/auth/forgot-password
 * @description Request password reset email
 * @access Public
 * @rateLimit 3 requests per hour per email
 * 
 * @body {string} email - User's email address
 * 
 * @returns {Object} Reset request confirmation
 * 
 * @example
 * POST /api/v1/auth/forgot-password
 * Body: { "email": "user@example.com" }
 */
router.post(
  '/forgot-password',
  rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    keyPrefix: 'forgot-password',
    message: 'Too many password reset requests, please try again later'
  }),
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);

/**
 * @route POST /api/v1/auth/reset-password
 * @description Reset password using reset token
 * @access Public
 * 
 * @body {string} token - Password reset token
 * @body {string} newPassword - New password
 * @body {string} [confirmPassword] - Confirm new password
 * 
 * @returns {Object} Password reset confirmation
 * 
 * @example
 * POST /api/v1/auth/reset-password
 * Body: { "token": "...", "newPassword": "NewSecurePassword123!" }
 */
router.post(
  '/reset-password',
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Too many password reset attempts, please try again later'
  }),
  validate(authValidation.resetPassword),
  authController.resetPassword
);

/**
 * @route POST /api/v1/auth/change-password
 * @description Change password for authenticated user
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} currentPassword - Current password
 * @body {string} newPassword - New password
 * 
 * @returns {Object} Password change confirmation
 * 
 * @example
 * POST /api/v1/auth/change-password
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "currentPassword": "OldPassword123!", "newPassword": "NewPassword123!" }
 */
router.post(
  '/change-password',
  validate(authValidation.changePassword),
  authController.changePassword
);

// =============================================================================
// EMAIL VERIFICATION
// =============================================================================

/**
 * @route POST /api/v1/auth/verify-email
 * @description Verify user email address
 * @access Public
 * 
 * @body {string} token - Email verification token
 * 
 * @returns {Object} Verification confirmation
 * 
 * @example
 * POST /api/v1/auth/verify-email
 * Body: { "token": "..." }
 */
router.post(
  '/verify-email',
  validate(authValidation.verifyEmail),
  authController.verifyEmail
);

/**
 * @route POST /api/v1/auth/resend-verification
 * @description Resend email verification
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} [email] - Email to resend verification (optional)
 * 
 * @returns {Object} Resend confirmation
 * 
 * @example
 * POST /api/v1/auth/resend-verification
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.post(
  '/resend-verification',
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 2,
    message: 'Too many verification requests, please try again later'
  }),
  validate(authValidation.resendVerification),
  authController.resendVerification
);

// =============================================================================
// TWO-FACTOR AUTHENTICATION (2FA)
// =============================================================================

/**
 * @route POST /api/v1/auth/2fa/setup
 * @description Setup two-factor authentication
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * 
 * @returns {Object} 2FA setup details
 * 
 * @example
 * POST /api/v1/auth/2fa/setup
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: { "secret": "...", "qrCode": "...", "backupCodes": [...] }
 */
router.post(
  '/2fa/setup',
  authController.setupTwoFactor
);

/**
 * @route POST /api/v1/auth/2fa/verify
 * @description Verify and enable two-factor authentication
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} code - 2FA verification code
 * 
 * @returns {Object} Verification confirmation
 * 
 * @example
 * POST /api/v1/auth/2fa/verify
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "code": "123456" }
 */
router.post(
  '/2fa/verify',
  validate(authValidation.verifyTwoFactor),
  authController.verifyTwoFactor
);

/**
 * @route POST /api/v1/auth/2fa/disable
 * @description Disable two-factor authentication
 * @access Protected
 * 
 * @header Authorization Bearer {accessToken}
 * @body {string} code - 2FA verification code
 * 
 * @returns {Object} Disable confirmation
 * 
 * @example
 * POST /api/v1/auth/2fa/disable
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "code": "123456" }
 */
router.post(
  '/2fa/disable',
  validate(authValidation.disableTwoFactor),
  authController.disableTwoFactor
);

// =============================================================================
// GOOGLE OAUTH AUTHENTICATION
// =============================================================================

/**
 * @route POST /api/v1/auth/google-signin
 * @description Google OAuth Sign-In / Sign-Up
 * @description Authenticate user via Google Firebase and returns JWT tokens
 * @description Automatically creates account if user doesn't exist
 * @access Public
 * @rateLimit 10 requests per minute per IP
 * 
 * @body {string} idToken - Firebase Google ID token (from frontend)
 * @body {string} email - User email from Google (backup validation)
 * @body {string} [displayName] - User display name from Google
 * @body {string} [photoURL] - User photo URL from Google
 * @body {string} [role=rider] - User role (rider/driver/admin)
 * 
 * @returns {Object} User account details and JWT tokens
 * 
 * @security Requires valid Firebase ID token
 * @validation Token must be signed by Google and valid for Firebase project
 * 
 * @example
 * POST /api/v1/auth/google-signin
 * Body: {
 *   "idToken": "eyJhbGciOiJSUzI1NiIs...",
 *   "email": "user@gmail.com",
 *   "displayName": "John Doe",
 *   "photoURL": "https://...",
 *   "role": "rider"
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "user": {
 *       "id": "123",
 *       "email": "user@gmail.com",
 *       "first_name": "John",
 *       "last_name": "Doe",
 *       "role": "rider",
 *       "profile_picture_url": "https://...",
 *       ...
 *     },
 *     "accessToken": "eyJhbGciOiJIUzI1NiIs...",
 *     "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
 *   },
 *   "message": "Login successful"
 * }
 * 
 * @throws {BadRequestException} - If idToken or email is missing
 * @throws {AuthenticationError} - If token verification fails
 */
router.post(
  '/google-signin',
  requestLogger,
  securityHeaders,
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many Google sign-in attempts, please try again later'
  }),
  verifyGoogleTokenMiddleware,
  authController.googleSignIn
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/auth/health
 * @description Health check for auth routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/auth/health
 * Response: { status: 'healthy', endpoint: '/api/v1/auth', version: '3.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/auth',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    services: {
      authentication: 'operational',
      tokenManagement: 'operational'
    }
  });
});

module.exports = router;
