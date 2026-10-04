/**
 * Promotion Routes
 * Version: 2.0.0
 * Description: Promotion and discount management endpoints
 * 
 * @module routes/v1/promotionRoutes
 * @requires express
 * @requires controllers/promotionController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/promotion.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const promotionController = require('../../controllers/promotionController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const promotionValidation = require('../../middleware/promotion.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all promotion routes
 */
router.use(auth, requestLogger);

// =============================================================================
// USER PROMOTION VIEWING
// =============================================================================

/**
 * @route GET /api/v1/promotions
 * @description Get available promotions
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status (active/expired/upcoming)
 * @queryParam {string} [type] - Filter by type (percentage/fixed/free)
 * @queryParam {string} [search] - Search by promotion name
 * 
 * @returns {Object} Paginated promotion list
 * 
 * @example
 * GET /api/v1/promotions?page=1&status=active&type=percentage
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "success": true,
 *   "data": {
 *     "promotions": [...],
 *     "pagination": { "page": 1, "limit": 20, "total": 15, "pages": 1 }
 *   }
 * }
 */
router.get(
  '/',
  validate(promotionValidation.listPromotions),
  cacheMiddleware({ ttl: 60 }),
  promotionController.list
);

/**
 * @route GET /api/v1/promotions/available
 * @description Get promotions available for current user
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @queryParam {number} [latitude] - User's latitude
 * @queryParam {number} [longitude] - User's longitude
 * @queryParam {string} [rideType] - Ride type filter
 * @queryParam {number} [estimatedFare] - Estimated fare for calculation
 * 
 * @returns {Object} Available promotions with applicability
 * 
 * @example
 * GET /api/v1/promotions/available?latitude=34.05&longitude=-118.25
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/available',
  validate(promotionValidation.getAvailablePromotions),
  cacheMiddleware({ ttl: 60 }),
  promotionController.getAvailable
);

/**
 * @route GET /api/v1/promotions/:id
 * @description Get promotion details
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @param {string} id - Promotion ID
 * @returns {Object} Promotion details
 * 
 * @example
 * GET /api/v1/promotions/promo_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  cacheMiddleware({ ttl: 60 }),
  validate(promotionValidation.getPromotionById),
  promotionController.getById
);

/**
 * @route POST /api/v1/promotions/validate
 * @description Validate a promotion code
 * @access All authenticated users
 * @rateLimit 20 requests per minute per user
 * 
 * @body {string} code - Promotion code to validate
 * @body {number} [amount] - Purchase amount for validation
 * @body {string} [rideType] - Ride type for validation
 * 
 * @returns {Object} Validation result with discount details
 * 
 * @example
 * POST /api/v1/promotions/validate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "code": "SAVE20", "amount": 50.00 }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "valid": true,
 *     "discount": 10.00,
 *     "type": "percentage",
 *     "details": { ... }
 *   }
 * }
 */
router.post(
  '/validate',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many validation attempts, please slow down'
  }),
  validate(promotionValidation.validatePromotion),
  promotionController.validate
);

/**
 * @route POST /api/v1/promotions/apply
 * @description Apply a promotion to a ride
 * @access All authenticated users
 * @rateLimit 10 requests per minute per user
 * 
 * @body {string} code - Promotion code
 * @body {string} rideId - Ride ID to apply promotion to
 * 
 * @returns {Object} Applied promotion with updated fare
 * 
 * @example
 * POST /api/v1/promotions/apply
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "code": "SAVE20", "rideId": "rid_123" }
 */
router.post(
  '/apply',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many apply attempts, please slow down'
  }),
  validate(promotionValidation.applyPromotion),
  promotionController.apply
);

// =============================================================================
// ADMIN PROMOTION MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/promotions
 * @description Create a new promotion (admin only)
 * @access Admin only
 * @rateLimit 5 requests per minute per user
 * 
 * @body {string} name - Promotion name
 * @body {string} code - Unique promotion code
 * @body {string} type - Promotion type (percentage/fixed/free)
 * @body {number} value - Discount value
 * @body {string} [description] - Promotion description
 * @body {string} [startDate] - Start date
 * @body {string} [endDate] - End date
 * @body {Object} [conditions] - Eligibility conditions
 * @body {Object} [usageLimits] - Usage limits
 * @body {string[]} [applicableRoles] - Eligible user roles
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created promotion
 * 
 * @example
 * POST /api/v1/promotions
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "name": "Summer Special",
 *   "code": "SUMMER2024",
 *   "type": "percentage",
 *   "value": 20,
 *   "description": "20% off all rides this summer",
 *   "startDate": "2024-06-01",
 *   "endDate": "2024-08-31",
 *   "conditions": { "minFare": 10.00 },
 *   "usageLimits": { "perUser": 3, "total": 1000 },
 *   "applicableRoles": ["rider"]
 * }
 */
router.post(
  '/',
  authorizeRoles('admin'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many promotion creation attempts, please slow down'
  }),
  validate(promotionValidation.createPromotion),
  promotionController.create
);

/**
 * @route PUT /api/v1/promotions/:id
 * @description Update a promotion (admin only)
 * @access Admin only
 * 
 * @param {string} id - Promotion ID
 * @body {Object} updates - Fields to update
 * @body {string} [name] - Updated name
 * @body {string} [description] - Updated description
 * @body {string} [startDate] - Updated start date
 * @body {string} [endDate] - Updated end date
 * @body {Object} [conditions] - Updated conditions
 * @body {Object} [usageLimits] - Updated usage limits
 * @body {string} [status] - Promotion status
 * 
 * @returns {Object} Updated promotion
 * 
 * @example
 * PUT /api/v1/promotions/promo_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "active", "endDate": "2024-09-30" }
 */
router.put(
  '/:id',
  authorizeRoles('admin'),
  validate(promotionValidation.updatePromotion),
  promotionController.update
);

/**
 * @route DELETE /api/v1/promotions/:id
 * @description Delete a promotion (admin only)
 * @access Admin only
 * 
 * @param {string} id - Promotion ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/promotions/promo_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Campaign ended" }
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(promotionValidation.deletePromotion),
  promotionController.delete
);

/**
 * @route PATCH /api/v1/promotions/:id/status
 * @description Update promotion status (admin only)
 * @access Admin only
 * 
 * @param {string} id - Promotion ID
 * @body {string} status - New status (active/inactive/expired)
 * @body {string} [reason] - Status change reason
 * 
 * @returns {Object} Updated status
 * 
 * @example
 * PATCH /api/v1/promotions/promo_123/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "inactive", "reason": "Temporarily paused" }
 */
router.patch(
  '/:id/status',
  authorizeRoles('admin'),
  validate(promotionValidation.updatePromotionStatus),
  promotionController.updateStatus
);

// =============================================================================
// PROMOTION STATISTICS
// =============================================================================

/**
 * @route GET /api/v1/promotions/statistics
 * @description Get promotion statistics (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [promotionId] - Specific promotion ID
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Promotion statistics
 * 
 * @example
 * GET /api/v1/promotions/statistics?period=month
 */
router.get(
  '/statistics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(promotionValidation.getPromotionStatistics),
  promotionController.getStatistics
);

/**
 * @route GET /api/v1/promotions/:id/analytics
 * @description Get promotion analytics (admin only)
 * @access Admin only * @cache 5 minutes
 * 
 * @param {string} id - Promotion ID
 * @queryParam {string} [period=month] - Analytics period
 * 
 * @returns {Object} Promotion analytics
 * 
 * @example
 * GET /api/v1/promotions/promo_123/analytics?period=week
 */
router.get(
  '/:id/analytics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(promotionValidation.getPromotionAnalytics),
  promotionController.getAnalytics
);

/**
 * @route GET /api/v1/promotions/performance
 * @description Get promotion performance comparison (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Performance period
 * @queryParam {string[]} [promotionIds] - Promotion IDs to compare
 * 
 * @returns {Object} Performance comparison
 * 
 * @example
 * GET /api/v1/promotions/performance?promotionIds[]=promo_123&promotionIds[]=promo_456
 */
router.get(
  '/performance',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(promotionValidation.getPerformanceComparison),
  promotionController.getPerformanceComparison
);

// =============================================================================
// USER PROMOTION USAGE
// =============================================================================

/**
 * @route GET /api/v1/promotions/user/history
 * @description Get user's promotion usage history
 * @access All authenticated users
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by usage status
 * 
 * @returns {Object} Paginated usage history
 * 
 * @example
 * GET /api/v1/promotions/user/history?page=1
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/user/history',
  validate(promotionValidation.getUserPromotionHistory),
  promotionController.getUserHistory
);

/**
 * @route GET /api/v1/promotions/user/saved
 * @description Get user's saved promotions
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @returns {Object} Saved promotions
 * 
 * @example
 * GET /api/v1/promotions/user/saved
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/user/saved',
  cacheMiddleware({ ttl: 60 }),
  promotionController.getSavedPromotions
);

/**
 * @route POST /api/v1/promotions/user/save
 * @description Save a promotion for later
 * @access All authenticated users
 * 
 * @body {string} promotionId - Promotion ID to save
 * 
 * @returns {Object} Save confirmation
 * 
 * @example
 * POST /api/v1/promotions/user/save
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "promotionId": "promo_123" }
 */
router.post(
  '/user/save',
  validate(promotionValidation.savePromotion),
  promotionController.savePromotion
);

/**
 * @route DELETE /api/v1/promotions/user/save/:promotionId
 * @description Remove saved promotion
 * @access All authenticated users
 * 
 * @param {string} promotionId - Promotion ID
 * @returns {Object} Removal confirmation
 * 
 * @example
 * DELETE /api/v1/promotions/user/save/promo_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/user/save/:promotionId',
  validate(promotionValidation.unsavePromotion),
  promotionController.unsavePromotion
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/promotions/health
 * @description Health check for promotion routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/promotions/health
 * Response: { status: 'healthy', endpoint: '/api/v1/promotions', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/promotions',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      promotionManagement: 'operational',
      promotionValidation: 'operational'
    }
  });
});

module.exports = router;