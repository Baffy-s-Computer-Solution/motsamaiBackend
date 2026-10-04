/**
 * Ride Routes
 * Version: 3.0.0
 * Description: Ride management and tracking endpoints
 * 
 * @module routes/v1/rideRoutes
 * @requires express
 * @requires controllers/rideController
 * @requires middleware/auth
 * @requires middleware/validate
 * @requires middleware/ride.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    endpoint: '/api/v1/rides',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Controllers
const rideController = require('../../controllers/rideController');

// Middleware
const { auth } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const rideValidation = require('../../middleware/ride.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');

/**
 * Apply authentication to all ride routes
 * All ride operations require authentication
 */
router.use((req, res, next) => {
  if (req.path === '/health') return next();
  return auth(req, res, next);
}, requestLogger);

// =============================================================================
// RIDE BOOKING & CREATION
// =============================================================================

/**
 * @route POST /api/v1/rides/book
 * @description Book a new ride
 * @access Rider only
 * @rateLimit 10 requests per minute per user
 * 
 * @body {Object} pickup - Pickup location
 * @body {number} pickup.latitude - Pickup latitude
 * @body {number} pickup.longitude - Pickup longitude
 * @body {string} pickup.address - Pickup address (optional)
 * 
 * @body {Object} dropoff - Dropoff location
 * @body {number} dropoff.latitude - Dropoff latitude
 * @body {number} dropoff.longitude - Dropoff longitude
 * @body {string} dropoff.address - Dropoff address (optional)
 * 
 * @body {string} [vehicleType] - Vehicle type preference (standard/premium/XL)
 * @body {string} [paymentMethod] - Payment method (card/wallet/cash)
 * @body {string} [schedule] - Scheduled time (ISO format)
 * @body {string} [notes] - Additional notes for driver
 * @body {number} [seats] - Number of seats required
 * 
 * @returns {Object} Created ride details with estimated fare and ETA
 * 
 * @example
 * POST /api/v1/rides/book
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "pickup": { "latitude": 34.05, "longitude": -118.25, "address": "123 Main St" },
 *   "dropoff": { "latitude": 34.10, "longitude": -118.30, "address": "456 Oak Ave" },
 *   "vehicleType": "standard",
 *   "paymentMethod": "wallet"
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "rideId": "rid_123",
 *     "estimatedFare": 15.50,
 *     "estimatedETA": "5 min",
 *     "driver": { ... },
 *     "status": "pending"
 *   }
 * }
 */
router.post(
  '/book',
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many ride booking attempts, please slow down'
  }),
  validate(rideValidation.bookRide),
  rideController.create
);

/**
 * @route POST /api/v1/rides/book/instant
 * @description Book an instant ride with automatic matching
 * @access Rider only
 * @rateLimit 5 requests per minute per user
 * 
 * @body {Object} pickup - Pickup location
 * @body {Object} dropoff - Dropoff location
 * @body {string} [vehicleType] - Vehicle type preference
 * @body {string} [paymentMethod] - Payment method
 * @body {number} [seats] - Number of seats required
 * 
 * @returns {Object} Instant ride booking with driver assignment
 * 
 * @example
 * POST /api/v1/rides/book/instant
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "pickup": { "latitude": 34.05, "longitude": -118.25 },
 *   "dropoff": { "latitude": 34.10, "longitude": -118.30 }
 * }
 */
router.post(
  '/book/instant',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many instant booking attempts, please slow down'
  }),
  validate(rideValidation.instantBook),
  rideController.instantBook
);

router.post(
  '/quick-book',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many quick booking attempts, please slow down'
  }),
  validate(rideValidation.instantBook),
  rideController.quickBook
);

/**
 * @route POST /api/v1/rides/estimate
 * @description Get fare and time estimate for a ride
 * @access Rider only
 * @rateLimit 20 requests per minute per user
 * 
 * @body {Object} pickup - Pickup location
 * @body {Object} dropoff - Dropoff location
 * @body {string} [vehicleType] - Vehicle type preference
 * @body {number} [seats] - Number of seats required
 * 
 * @returns {Object} Fare and time estimates
 * 
 * @example
 * POST /api/v1/rides/estimate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "pickup": { "latitude": 34.05, "longitude": -118.25 },
 *   "dropoff": { "latitude": 34.10, "longitude": -118.30 }
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "estimatedFare": 15.50,
 *     "estimatedDistance": 5.2,
 *     "estimatedDuration": 15,
 *     "surgeMultiplier": 1.2,
 *     "fareBreakdown": { ... }
 *   }
 * }
 */
router.post(
  '/estimate',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Too many estimate requests, please slow down'
  }),
  validate(rideValidation.getEstimate),
  rideController.getEstimate
);

// =============================================================================
// RIDE MANAGEMENT
// =============================================================================

router.get(
  '/active',
  rideController.getActiveRide
);

router.get(
  '/history',
  validate(rideValidation.getRideHistory),
  rideController.getRideHistory
);

/**
 * @route GET /api/v1/rides/:id
 * @description Get ride details by ID
 * @access Rider/Driver/Admin (role-based access)
 * @cache 30 seconds
 * 
 * @param {string} id - Ride ID
 * @returns {Object} Complete ride details
 * 
 * @example
 * GET /api/v1/rides/rid_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  cacheMiddleware({ ttl: 30 }),
  validate(rideValidation.getRideById),
  rideController.getRideById
);

/**
 * @route GET /api/v1/rides
 * @description Get user's ride history
 * @access Rider/Driver (role-based)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by ride status
 * @queryParam {string} [startDate] - Start date filter
 * @queryParam {string} [endDate] - End date filter
 * @queryParam {string} [type] - Ride type (past/upcoming)
 * 
 * @returns {Object} Paginated ride history
 * 
 * @example
 * GET /api/v1/rides?page=1&status=completed&type=past
 */
router.get(
  '/',
  validate(rideValidation.getRideHistory),
  rideController.getRideHistory
);

/**
 * @route PUT /api/v1/rides/:id/cancel
 * @description Cancel a ride
 * @access Rider/Driver/Admin
 * 
 * @param {string} id - Ride ID
 * @body {string} reason - Cancellation reason
 * @body {string} [cancelledBy] - Who is cancelling (rider/driver/system)
 * 
 * @returns {Object} Cancellation confirmation with penalty information
 * 
 * @example
 * PUT /api/v1/rides/rid_123/cancel
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Changed my mind", "cancelledBy": "rider" }
 */
router.put(
  '/:id/cancel',
  validate(rideValidation.cancelRide),
  rideController.cancelRide
);

// =============================================================================
// RIDE STATUS UPDATES
// =============================================================================

/**
 * @route PUT /api/v1/rides/:id/status
 * @description Update ride status (driver only)
 * @access Driver only
 * 
 * @param {string} id - Ride ID
 * @body {string} status - New status (accepted/arrived/started/completed)
 * @body {Object} [location] - Current location update
 * 
 * @returns {Object} Updated ride status
 * 
 * @example
 * PUT /api/v1/rides/rid_123/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "arrived", "location": { "latitude": 34.05, "longitude": -118.25 } }
 */
router.put(
  '/:id/status',
  validate(rideValidation.updateRideStatus),
  rideController.updateRideStatus
);

/**
 * @route PUT /api/v1/rides/:id/accept
 * @description Accept ride assignment
 * @access Driver only
 * @rateLimit 30 requests per minute
 * 
 * @param {string} id - Ride ID
 * @body {Object} [driverLocation] - Driver's current location
 * 
 * @returns {Object} Updated ride details
 * 
 * @example
 * PUT /api/v1/rides/rid_123/accept
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "driverLocation": { "latitude": 34.05, "longitude": -118.25 } }
 */
router.put(
  '/:id/accept',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many acceptance attempts, please slow down'
  }),
  validate(rideValidation.acceptRide),
  rideController.acceptRide
);

/**
 * @route PUT /api/v1/rides/:id/arrive
 * @description Driver arrives at pickup location
 * @access Driver only
 * 
 * @param {string} id - Ride ID
 * @body {Object} [location] - Arrival location
 * 
 * @returns {Object} Updated ride status
 * 
 * @example
 * PUT /api/v1/rides/rid_123/arrive
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.put(
  '/:id/arrive',
  validate(rideValidation.arriveRide),
  rideController.arriveRide
);

/**
 * @route PUT /api/v1/rides/:id/start
 * @description Start the ride
 * @access Driver only
 * 
 * @param {string} id - Ride ID
 * @body {Object} [startLocation] - Starting location
 * 
 * @returns {Object} Updated ride status
 * 
 * @example
 * PUT /api/v1/rides/rid_123/start
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.put(
  '/:id/start',
  validate(rideValidation.startRide),
  rideController.startRide
);

/**
 * @route PUT /api/v1/rides/:id/complete
 * @description Complete the ride
 * @access Driver only
 * 
 * @param {string} id - Ride ID
 * @body {Object} [endLocation] - Ending location
 * @body {number} [distance] - Total distance traveled
 * @body {number} [duration] - Total ride duration
 * @body {string} [paymentMethod] - Payment method used
 * 
 * @returns {Object} Completed ride with final fare
 * 
 * @example
 * PUT /api/v1/rides/rid_123/complete
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "distance": 5.2, "duration": 15, "paymentMethod": "card" }
 */
router.put(
  '/:id/complete',
  validate(rideValidation.completeRide),
  rideController.completeRide
);

// =============================================================================
// RIDE TRACKING
// =============================================================================

/**
 * @route GET /api/v1/rides/:id/tracking
 * @description Get real-time ride tracking information
 * @access Rider/Driver (ride participants)
 * @cache 5 seconds
 * 
 * @param {string} id - Ride ID
 * @returns {Object} Tracking information including:
 *   - driverLocation: { latitude, longitude, heading, speed }
 *   - rideStatus: current status
 *   - eta: time remaining to destination
 *   - route: polyline of current route
 * 
 * @example
 * GET /api/v1/rides/rid_123/tracking
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/tracking',
  cacheMiddleware({ ttl: 5 }),
  validate(rideValidation.getTrackingInfo),
  rideController.getTrackingInfo
);

/**
 * @route GET /api/v1/rides/:id/route
 * @description Get ride route details
 * @access Rider/Driver (ride participants)
 * @cache 1 minute
 * 
 * @param {string} id - Ride ID
 * @returns {Object} Route details with waypoints
 * 
 * @example
 * GET /api/v1/rides/rid_123/route
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/route',
  cacheMiddleware({ ttl: 60 }),
  validate(rideValidation.getRouteDetails),
  rideController.getRouteDetails
);

// =============================================================================
// PAYMENT & BILLING
// =============================================================================

/**
 * @route GET /api/v1/rides/:id/payment
 * @description Get payment details for a ride
 * @access Rider/Driver/Admin
 * 
 * @param {string} id - Ride ID
 * @returns {Object} Payment details and transaction history
 * 
 * @example
 * GET /api/v1/rides/rid_123/payment
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/payment',
  validate(rideValidation.getPaymentDetails),
  rideController.getPaymentDetails
);

/**
 * @route PUT /api/v1/rides/:id/payment/process
 * @description Process payment for a ride
 * @access Rider only
 * 
 * @param {string} id - Ride ID
 * @body {string} paymentMethod - Payment method to use
 * @body {string} [tip] - Tip amount (optional)
 * 
 * @returns {Object} Payment confirmation
 * 
 * @example
 * PUT /api/v1/rides/rid_123/payment/process
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "paymentMethod": "wallet", "tip": 2.00 }
 */
router.put(
  '/:id/payment/process',
  validate(rideValidation.processPayment),
  rideController.processPayment
);

// =============================================================================
// RATING & REVIEW
// =============================================================================

/**
 * @route POST /api/v1/rides/:id/rate
 * @description Rate a ride experience
 * @access Rider/Driver (ride participants)
 * 
 * @param {string} id - Ride ID
 * @body {number} rating - Rating (1-5)
 * @body {string} [review] - Review text
 * @body {string} [target] - Who is being rated (driver/rider)
 * @body {Object} [tags] - Rating tags (optional)
 * 
 * @returns {Object} Rating confirmation
 * 
 * @example
 * POST /api/v1/rides/rid_123/rate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "rating": 5,
 *   "review": "Excellent ride!",
 *   "target": "driver",
 *   "tags": ["punctual", "friendly"]
 * }
 */
router.post(
  '/:id/rate',
  validate(rideValidation.rateRide),
  rideController.rateRide
);

/**
 * @route GET /api/v1/rides/:id/reviews
 * @description Get reviews for a ride
 * @access Rider/Driver (ride participants)
 * 
 * @param {string} id - Ride ID
 * @returns {Object} Reviews from both parties
 * 
 * @example
 * GET /api/v1/rides/rid_123/reviews
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/reviews',
  validate(rideValidation.getRideReviews),
  rideController.getRideReviews
);

// =============================================================================
// RECURRING RIDES
// =============================================================================

/**
 * @route POST /api/v1/rides/recurring
 * @description Create a recurring ride schedule
 * @access Rider only
 * 
 * @body {Object} rideDetails - Basic ride details
 * @body {string} frequency - Recurrence frequency (daily/weekly/monthly)
 * @body {string} startDate - Start date for recurrence
 * @body {string} [endDate] - End date for recurrence
 * @body {string[]} [daysOfWeek] - Days of week for weekly recurrence
 * @body {number[]} [daysOfMonth] - Days of month for monthly recurrence
 * 
 * @returns {Object} Created recurring ride schedule
 * 
 * @example
 * POST /api/v1/rides/recurring
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "rideDetails": { ... },
 *   "frequency": "weekly",
 *   "startDate": "2024-01-15",
 *   "daysOfWeek": ["monday", "wednesday", "friday"]
 * }
 */
router.post(
  '/recurring',
  validate(rideValidation.createRecurringRide),
  rideController.createRecurringRide
);

/**
 * @route GET /api/v1/rides/recurring
 * @description Get recurring ride schedules
 * @access Rider only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} List of recurring schedules
 * 
 * @example
 * GET /api/v1/rides/recurring?page=1
 */
router.get(
  '/recurring',
  validate(rideValidation.getRecurringRides),
  rideController.getRecurringRides
);

/**
 * @route PUT /api/v1/rides/recurring/:scheduleId
 * @description Update a recurring ride schedule
 * @access Rider only
 * 
 * @param {string} scheduleId - Schedule ID
 * @body {Object} updates - Fields to update
 * 
 * @returns {Object} Updated schedule
 * 
 * @example
 * PUT /api/v1/rides/recurring/sched_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.put(
  '/recurring/:scheduleId',
  validate(rideValidation.updateRecurringRide),
  rideController.updateRecurringRide
);

/**
 * @route DELETE /api/v1/rides/recurring/:scheduleId
 * @description Cancel a recurring ride schedule
 * @access Rider only
 * 
 * @param {string} scheduleId - Schedule ID
 * @returns {Object} Cancellation confirmation
 * 
 * @example
 * DELETE /api/v1/rides/recurring/sched_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/recurring/:scheduleId',
  validate(rideValidation.cancelRecurringRide),
  rideController.cancelRecurringRide
);

// =============================================================================
// PROMOTIONS & DISCOUNTS
// =============================================================================

/**
 * @route GET /api/v1/rides/promotions/available
 * @description Get available promotions for a ride
 * @access Rider only
 * 
 * @queryParam {number} pickupLat - Pickup latitude
 * @queryParam {number} pickupLng - Pickup longitude
 * @queryParam {number} dropoffLat - Dropoff latitude
 * @queryParam {number} dropoffLng - Dropoff longitude
 * @queryParam {number} [estimatedFare] - Estimated fare amount
 * 
 * @returns {Object} Available promotions and discounts
 * 
 * @example
 * GET /api/v1/rides/promotions/available?pickupLat=34.05&pickupLng=-118.25&dropoffLat=34.10&dropoffLng=-118.30
 */
router.get(
  '/promotions/available',
  validate(rideValidation.getAvailablePromotions),
  rideController.getAvailablePromotions
);

/**
 * @route POST /api/v1/rides/promotions/apply
 * @description Apply a promotion code to a ride
 * @access Rider only
 * 
 * @body {string} rideId - Ride ID
 * @body {string} code - Promotion code
 * 
 * @returns {Object} Applied promotion with new total
 * 
 * @example
 * POST /api/v1/rides/promotions/apply
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "rideId": "rid_123", "code": "SAVE20" }
 */
router.post(
  '/promotions/apply',
  validate(rideValidation.applyPromotion),
  rideController.applyPromotion
);

// =============================================================================
// STATISTICS & INSIGHTS
// =============================================================================

/**
 * @route GET /api/v1/rides/statistics
 * @description Get ride statistics and insights
 * @access Rider/Driver/Admin (role-based)
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Ride statistics and insights
 * 
 * @example
 * GET /api/v1/rides/statistics?period=week
 */
router.get(
  '/statistics',
  cacheMiddleware({ ttl: 300 }),
  validate(rideValidation.getRideStatistics),
  rideController.getRideStatistics
);

router.get(
  '/stats',
  cacheMiddleware({ ttl: 300 }),
  validate(rideValidation.getRideStatistics),
  rideController.getRideStatistics
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/rides/health
 * @description Health check for ride routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/rides/health
 * Response: { status: 'healthy', endpoint: '/api/v1/rides', version: '3.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/rides',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    services: {
      rideManagement: 'operational',
      tracking: 'operational'
    }
  });
});

module.exports = router;
