/**
 * Review Routes
 * Version: 2.0.0
 * Description: Review and rating management endpoints
 * 
 * @module routes/v1/reviewRoutes
 * @requires express
 * @requires controllers/reviewController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/review.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const reviewController = require('../../controllers/reviewController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const reviewValidation = require('../../middleware/review.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all review routes
 */
router.use(auth, requestLogger);

// =============================================================================
// REVIEW CREATION & MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/reviews
 * @description Create a review
 * @access All authenticated users
 * @rateLimit 5 requests per minute per user
 * 
 * @body {number} rating - Rating (1-5)
 * @body {string} targetId - Target entity ID (driver/rider/ride)
 * @body {string} targetType - Target type (driver/rider/ride)
 * @body {string} [review] - Review text
 * @body {string} [rideId] - Associated ride ID
 * @body {string[]} [tags] - Review tags
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created review
 * 
 * @example
 * POST /api/v1/reviews
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "rating": 5,
 *   "targetId": "drv_123",
 *   "targetType": "driver",
 *   "review": "Excellent driver! Very professional and punctual.",
 *   "rideId": "rid_123",
 *   "tags": ["punctual", "friendly", "clean_vehicle"]
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "reviewId": "rev_123",
 *     "rating": 5,
 *     "review": "Excellent driver!",
 *     "createdAt": "2024-01-15T10:30:00Z"
 *   }
 * }
 */
router.post(
  '/',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many reviews, please slow down'
  }),
  validate(reviewValidation.createReview),
  reviewController.create
);

/**
 * @route GET /api/v1/reviews
 * @description Get reviews
 * @access All authenticated users
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [targetId] - Target entity ID
 * @queryParam {string} [targetType] - Target type
 * @queryParam {number} [minRating] - Minimum rating
 * @queryParam {number} [maxRating] - Maximum rating
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order
 * 
 * @returns {Object} Paginated reviews
 * 
 * @example
 * GET /api/v1/reviews?targetId=drv_123&minRating=4&page=1
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/',
  validate(reviewValidation.listReviews),
  cacheMiddleware({ ttl: 30 }),
  reviewController.list
);

/**
 * @route GET /api/v1/reviews/:id
 * @description Get review details
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @param {string} id - Review ID
 * @returns {Object} Review details
 * 
 * @example
 * GET /api/v1/reviews/rev_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  cacheMiddleware({ ttl: 60 }),
  validate(reviewValidation.getReviewById),
  reviewController.getReviewById
);

/**
 * @route PUT /api/v1/reviews/:id
 * @description Update review (author only)
 * @access Review author only
 * 
 * @param {string} id - Review ID
 * @body {number} [rating] - Updated rating
 * @body {string} [review] - Updated review text
 * @body {string[]} [tags] - Updated tags
 * 
 * @returns {Object} Updated review
 * 
 * @example
 * PUT /api/v1/reviews/rev_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "rating": 4, "review": "Updated review text" }
 */
router.put(
  '/:id',
  validate(reviewValidation.updateReview),
  reviewController.update
);

/**
 * @route DELETE /api/v1/reviews/:id
 * @description Delete review (author or admin)
 * @access Review author or Admin
 * 
 * @param {string} id - Review ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/reviews/rev_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Review no longer relevant" }
 */
router.delete(
  '/:id',
  validate(reviewValidation.deleteReview),
  reviewController.delete
);

// =============================================================================
// REVIEW RESPONSES
// =============================================================================

/**
 * @route POST /api/v1/reviews/:id/response
 * @description Respond to a review
 * @access Review target or Admin
 * 
 * @param {string} id - Review ID
 * @body {string} response - Response text
 * 
 * @returns {Object} Updated review with response
 * 
 * @example
 * POST /api/v1/reviews/rev_123/response
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "response": "Thank you for your review! We appreciate your feedback." }
 */
router.post(
  '/:id/response',
  validate(reviewValidation.respondToReview),
  reviewController.respond
);

/**
 * @route PUT /api/v1/reviews/:id/response
 * @description Update review response
 * @access Review target or Admin
 * 
 * @param {string} id - Review ID
 * @body {string} response - Updated response text
 * 
 * @returns {Object} Updated response
 * 
 * @example
 * PUT /api/v1/reviews/rev_123/response
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "response": "Thank you! We value your feedback." }
 */
router.put(
  '/:id/response',
  validate(reviewValidation.updateResponse),
  reviewController.updateResponse
);

/**
 * @route DELETE /api/v1/reviews/:id/response
 * @description Delete review response
 * @access Review target or Admin
 * 
 * @param {string} id - Review ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/reviews/rev_123/response
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/:id/response',
  validate(reviewValidation.deleteResponse),
  reviewController.deleteResponse
);

// =============================================================================
// REVIEW REPORTS & MODERATION
// =============================================================================

/**
 * @route POST /api/v1/reviews/:id/report
 * @description Report a review (flag for moderation)
 * @access All authenticated users
 * 
 * @param {string} id - Review ID
 * @body {string} reason - Report reason
 * @body {string} [description] - Additional details
 * 
 * @returns {Object} Report confirmation
 * 
 * @example
 * POST /api/v1/reviews/rev_123/report
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "inappropriate", "description": "Contains offensive language" }
 */
router.post(
  '/:id/report',
  validate(reviewValidation.reportReview),
  reviewController.report
);

/**
 * @route PATCH /api/v1/reviews/:id/moderate
 * @description Moderate a review (admin only)
 * @access Admin only
 * 
 * @param {string} id - Review ID
 * @body {string} action - Moderation action (hide/restore/delete)
 * @body {string} [reason] - Moderation reason
 * 
 * @returns {Object} Moderation confirmation
 * 
 * @example
 * PATCH /api/v1/reviews/rev_123/moderate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "action": "hide", "reason": "Policy violation" }
 */
router.patch(
  '/:id/moderate',
  authorizeRoles('admin'),
  validate(reviewValidation.moderateReview),
  reviewController.moderate
);

// =============================================================================
// REVIEW ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/reviews/statistics
 * @description Get review statistics
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [targetId] - Target entity ID
 * @queryParam {string} [targetType] - Target type
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Review statistics
 * 
 * @example
 * GET /api/v1/reviews/statistics?targetId=drv_123&period=month
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/statistics',
  authorizeRoles('admin', 'manager'),
  cacheMiddleware({ ttl: 300 }),
  validate(reviewValidation.getReviewStatistics),
  reviewController.getStatistics
);

/**
 * @route GET /api/v1/reviews/analytics/sentiment
 * @description Get sentiment analysis of reviews
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [targetId] - Target entity ID
 * @queryParam {string} [targetType] - Target type
 * @queryParam {string} [period=month] - Analysis period
 * 
 * @returns {Object} Sentiment analysis
 * 
 * @example
 * GET /api/v1/reviews/analytics/sentiment?targetId=drv_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/analytics/sentiment',
  authorizeRoles('admin', 'manager'),
  cacheMiddleware({ ttl: 300 }),
  validate(reviewValidation.getSentimentAnalysis),
  reviewController.getSentimentAnalysis
);

/**
 * @route GET /api/v1/reviews/analytics/trends
 * @description Get review trends over time
 * @access Admin, Manager roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [targetId] - Target entity ID
 * @queryParam {string} [targetType] - Target type
 * @queryParam {string} [period=month] - Trend period
 * 
 * @returns {Object} Review trends
 * 
 * @example
 * GET /api/v1/reviews/analytics/trends?targetId=drv_123&period=year
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/analytics/trends',
  authorizeRoles('admin', 'manager'),
  cacheMiddleware({ ttl: 300 }),
  validate(reviewValidation.getReviewTrends),
  reviewController.getReviewTrends
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/reviews/health
 * @description Health check for review routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/reviews/health
 * Response: { status: 'healthy', endpoint: '/api/v1/reviews', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/reviews',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      reviewManagement: 'operational',
      reviewModeration: 'operational'
    }
  });
});

module.exports = router;