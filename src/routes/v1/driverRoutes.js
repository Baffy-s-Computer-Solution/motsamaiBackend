/**
 * Driver Routes - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete driver management system with all endpoints
 * 
 * @module routes/v1/driverRoutes
 * @author Motsamai Development Team
 * @license Proprietary
 */

const express = require('express');
const router = express.Router();

// =============================================================================
// CONTROLLERS
// =============================================================================
const driverController = require('../../controllers/driverController');
const driverAnalyticsController = require('../../controllers/driverAnalyticsController');
const driverDocumentController = require('../../controllers/driverDocumentController');
const driverEarningsController = require('../../controllers/driverEarningsController');
const driverRideController = require('../../controllers/driverRideController');
const driverVehicleController = require('../../controllers/driverVehicleController');

// =============================================================================
// MIDDLEWARE
// =============================================================================
const { auth, optionalAuth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const driverValidation = require('../../middleware/driver.validation');
const { cacheMiddleware, invalidateCache } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger, performanceLogger } = require('../../middleware/requestLogger');
const { upload, handleUploadError } = require('../../utils/fileUpload');
const asyncHandler = require('../../utils/asyncHandler');
const { APIError: AppError } = require('../../utils/apiError');
const logger = require('../../utils/logger');

// =============================================================================
// CONSTANTS
// =============================================================================
const CACHE_TTL = {
    PROFILE: 30,
    STATISTICS: 60,
    STATUS: 10,
    EARNINGS: 300,
    SETTINGS: 300,
    VEHICLE: 60,
    RATINGS: 300,
    AVAILABLE_RIDES: 5,
};

const RATE_LIMITS = {
    LOCATION_UPDATE: { windowMs: 1000, max: 5 },
    RIDE_ACCEPTANCE: { windowMs: 60000, max: 30 },
    DOCUMENT_UPLOAD: { windowMs: 60000, max: 10 },
    STATUS_UPDATE: { windowMs: 60000, max: 20 },
    EARNINGS_REQUEST: { windowMs: 60000, max: 30 },
};

router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        endpoint: '/api/v1/drivers',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
    });
});

// =============================================================================
// MIDDLEWARE APPLICATION
// =============================================================================
router.use((req, res, next) => {
    if (req.path === '/health') return next();
    return auth(req, res, next);
});
router.use(requestLogger);
router.use(performanceLogger);

// =============================================================================
// SECTION 1: PROFILE MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/profile
 * @desc    Get current driver's complete profile
 * @access  Private (Driver)
 * @cache   30 seconds
 * 
 * @returns {Object} Complete driver profile with:
 *   - Personal information
 *   - Vehicle details
 *   - Verification status
 *   - Performance metrics
 *   - Rating summary
 *   - Current status
 * 
 * @example
 * GET /api/v1/drivers/profile
 * Authorization: Bearer <token>
 * Response: { success: true, data: { ...driverProfile } }
 */
router.get(
    '/profile',
    cacheMiddleware({ ttl: CACHE_TTL.PROFILE }),
    asyncHandler(driverController.getProfile)
);

/**
 * @route   GET /api/v1/drivers/profile/:id
 * @desc    Get driver profile by ID (admin only)
 * @access  Private (Admin only)
 * @cache   30 seconds
 * 
 * @param   {string} id - Driver ID
 * @returns {Object} Complete driver profile
 * 
 * @example
 * GET /api/v1/drivers/profile/drv_123
 * Authorization: Bearer <admin_token>
 */
router.get(
    '/profile/:id',
    authorizeRoles('admin', 'manager'),
    cacheMiddleware({ ttl: CACHE_TTL.PROFILE }),
    asyncHandler(driverController.getDriverProfileById)
);

/**
 * @route   PUT /api/v1/drivers/profile
 * @desc    Update driver profile
 * @access  Private (Driver)
 * @invalidateCache /api/v1/drivers/profile
 * 
 * @body    {Object} profileData - Updated profile fields
 * @body    {string} [profileData.name] - Driver's full name
 * @body    {string} [profileData.phone] - Phone number
 * @body    {string} [profileData.email] - Email address
 * @body    {Object} [profileData.preferences] - User preferences
 * @body    {Object} [profileData.settings] - User settings
 * @body    {string} [profileData.bio] - Driver biography
 * @body    {string[]} [profileData.languages] - Spoken languages
 * @body    {Object} [profileData.address] - Home address
 * 
 * @returns {Object} Updated driver profile
 * 
 * @example
 * PUT /api/v1/drivers/profile
 * Authorization: Bearer <token>
 * Body: {
 *   "name": "John Driver Jr.",
 *   "phone": "+1234567890",
 *   "preferences": { "notifications": true, "language": "en" },
 *   "bio": "Experienced driver with 5 years of service"
 * }
 */
router.put(
    '/profile',
    invalidateCache('/api/v1/drivers/profile'),
    validate(driverValidation.updateProfile),
    asyncHandler(driverController.updateProfile)
);

/**
 * @route   PATCH /api/v1/drivers/profile
 * @desc    Partial update driver profile
 * @access  Private (Driver)
 * 
 * @body    {Object} updates - Partial profile updates
 * @returns {Object} Updated driver profile
 * 
 * @example
 * PATCH /api/v1/drivers/profile
 * Authorization: Bearer <token>
 * Body: { "preferences": { "notifications": false } }
 */
router.patch(
    '/profile',
    invalidateCache('/api/v1/drivers/profile'),
    validate(driverValidation.partialUpdateProfile),
    asyncHandler(driverController.partialUpdateProfile)
);

/**
 * @route   POST /api/v1/drivers/profile/avatar
 * @desc    Upload driver avatar/photo
 * @access  Private (Driver)
 * @rateLimit 5 requests per minute
 * 
 * @formData {File} avatar - Image file (JPEG, PNG, WEBP)
 * @formData {string} [crop] - Crop data JSON string
 * 
 * @returns {Object} Uploaded avatar URL
 * 
 * @example
 * POST /api/v1/drivers/profile/avatar
 * Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * formData: { "avatar": [file], "crop": "{\"x\":0,\"y\":0,\"width\":200,\"height\":200}" }
 */
router.post(
    '/profile/avatar',
    rateLimiter(RATE_LIMITS.DOCUMENT_UPLOAD),
    upload.single('avatar'),
    handleUploadError,
    validate(driverValidation.uploadAvatar),
    asyncHandler(driverController.uploadAvatar)
);

/**
 * @route   DELETE /api/v1/drivers/profile/avatar
 * @desc    Remove driver avatar
 * @access  Private (Driver)
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/profile/avatar
 * Authorization: Bearer <token>
 */
router.delete(
    '/profile/avatar',
    asyncHandler(driverController.removeAvatar)
);

// =============================================================================
// SECTION 2: STATUS MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/status
 * @desc    Get current driver status
 * @access  Private (Driver)
 * @cache   10 seconds
 * 
 * @returns {Object} Driver status with:
 *   - status: online/offline/busy
 *   - lastLocation: { lat, lng }
 *   - lastUpdated: timestamp
 *   - currentRide: ride ID if active
 * 
 * @example
 * GET /api/v1/drivers/status
 * Authorization: Bearer <token>
 */
router.get(
    '/status',
    cacheMiddleware({ ttl: CACHE_TTL.STATUS }),
    asyncHandler(driverController.getStatus)
);

/**
 * @route   PATCH /api/v1/drivers/status
 * @desc    Update driver online/offline/busy status
 * @access  Private (Driver)
 * @rateLimit 20 requests per minute
 * @invalidateCache /api/v1/drivers/status
 * 
 * @body    {string} status - Status value (online/offline/busy/available)
 * @body    {Object} [location] - Current location
 * @body    {number} location.latitude - Latitude
 * @body    {number} location.longitude - Longitude
 * @body    {string} [reason] - Reason for status change
 * 
 * @returns {Object} Updated driver status
 * 
 * @example
 * PATCH /api/v1/drivers/status
 * Authorization: Bearer <token>
 * Body: {
 *   "status": "online",
 *   "location": { "latitude": 34.05, "longitude": -118.25 },
 *   "reason": "Starting shift"
 * }
 */
router.patch(
    '/status',
    rateLimiter(RATE_LIMITS.STATUS_UPDATE),
    invalidateCache('/api/v1/drivers/status'),
    validate(driverValidation.updateStatus),
    asyncHandler(driverController.setOnlineStatus)
);

/**
 * @route   PATCH /api/v1/drivers/status/busy
 * @desc    Set driver status to busy (on ride)
 * @access  Private (Driver)
 * 
 * @returns {Object} Updated status
 * 
 * @example
 * PATCH /api/v1/drivers/status/busy
 * Authorization: Bearer <token>
 */
router.patch(
    '/status/busy',
    invalidateCache('/api/v1/drivers/status'),
    asyncHandler(driverController.setBusy)
);

/**
 * @route   PATCH /api/v1/drivers/status/available
 * @desc    Set driver status to available (ready for rides)
 * @access  Private (Driver)
 * 
 * @returns {Object} Updated status
 * 
 * @example
 * PATCH /api/v1/drivers/status/available
 * Authorization: Bearer <token>
 */
router.patch(
    '/status/available',
    invalidateCache('/api/v1/drivers/status'),
    asyncHandler(driverController.setAvailable)
);

/**
 * @route   GET /api/v1/drivers/status/history
 * @desc    Get driver status change history
 * @access  Private (Driver)
 * 
 * @queryParam {number} [limit=50] - Number of history entries
 * @queryParam {string} [startDate] - Start date filter
 * @queryParam {string} [endDate] - End date filter
 * 
 * @returns {Object} Status history array
 * 
 * @example
 * GET /api/v1/drivers/status/history?limit=10
 */
router.get(
    '/status/history',
    validate(driverValidation.getStatusHistory),
    asyncHandler(driverController.getStatusHistory)
);

// =============================================================================
// SECTION 3: RIDE MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/rides
 * @desc    Get driver's ride history with pagination and filters
 * @access  Private (Driver)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status (pending/accepted/started/completed/cancelled)
 * @queryParam {string} [startDate] - Start date (ISO format)
 * @queryParam {string} [endDate] - End date (ISO format)
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order (asc/desc)
 * @queryParam {string} [search] - Search by ride ID or passenger name
 * 
 * @returns {Object} Paginated ride history with:
 *   - rides: Array of ride objects
 *   - pagination: { page, limit, total, pages }
 *   - summary: { totalRides, totalEarnings, averageRating }
 * 
 * @example
 * GET /api/v1/drivers/rides?page=1&limit=10&status=completed
 * Authorization: Bearer <token>
 */
router.get(
    '/rides',
    validate(driverValidation.getRideHistory),
    asyncHandler(driverRideController.getRideHistory)
);

/**
 * @route   GET /api/v1/drivers/rides/current
 * @desc    Get current active ride details
 * @access  Private (Driver)
 * 
 * @returns {Object} Current ride details or null if no active ride
 * 
 * @example
 * GET /api/v1/drivers/rides/current
 * Authorization: Bearer <token>
 */
router.get(
    '/rides/current',
    asyncHandler(driverRideController.getCurrentRide)
);

/**
 * @route   GET /api/v1/drivers/rides/:rideId
 * @desc    Get specific ride by ID with full details
 * @access  Private (Driver)
 * @cache   10 seconds
 * 
 * @param   {string} rideId - Ride ID
 * @returns {Object} Complete ride details
 * 
 * @example
 * GET /api/v1/drivers/rides/rid_123
 * Authorization: Bearer <token>
 */
router.get(
    '/rides/:rideId',
    cacheMiddleware({ ttl: 10 }),
    validate(driverValidation.getRideById),
    asyncHandler(driverRideController.getRideById)
);

/**
 * @route   GET /api/v1/drivers/rides/:rideId/tracking
 * @desc    Get real-time tracking data for active ride
 * @access  Private (Driver)
 * @cache   5 seconds
 * 
 * @param   {string} rideId - Ride ID
 * @returns {Object} Tracking data with:
 *   - driverLocation: { lat, lng, heading, speed }
 *   - rideStatus: current status
 *   - eta: time to destination
 *   - route: encoded polyline
 *   - progress: percentage completion
 * 
 * @example
 * GET /api/v1/drivers/rides/rid_123/tracking
 * Authorization: Bearer <token>
 */
router.get(
    '/rides/:rideId/tracking',
    cacheMiddleware({ ttl: 5 }),
    validate(driverValidation.getRideTracking),
    asyncHandler(driverRideController.getRideTracking)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/accept
 * @desc    Accept a ride request
 * @access  Private (Driver)
 * @rateLimit 30 requests per minute
 * 
 * @param   {string} rideId - Ride ID
 * @body    {Object} [location] - Driver's current location
 * @body    {number} [location.latitude] - Latitude
 * @body    {number} [location.longitude] - Longitude
 * @body    {number} [eta] - Estimated time to pickup in minutes
 * 
 * @returns {Object} Accepted ride details with driver info
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/accept
 * Authorization: Bearer <token>
 * Body: { "location": { "latitude": 34.05, "longitude": -118.25 }, "eta": 5 }
 */
router.put(
    '/rides/:rideId/accept',
    rateLimiter(RATE_LIMITS.RIDE_ACCEPTANCE),
    validate(driverValidation.acceptRide),
    asyncHandler(driverRideController.acceptRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/decline
 * @desc    Decline a ride request
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {string} [reason] - Decline reason
 * @body    {string} [reasonCode] - Reason code (busy/distance/low_fare/other)
 * 
 * @returns {Object} Decline confirmation
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/decline
 * Authorization: Bearer <token>
 * Body: { "reason": "Too far", "reasonCode": "distance" }
 */
router.put(
    '/rides/:rideId/decline',
    validate(driverValidation.declineRide),
    asyncHandler(driverRideController.declineRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/arrive
 * @desc    Driver arrives at pickup location
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {Object} [location] - Arrival location
 * @body    {number} [location.latitude] - Latitude
 * @body    {number} [location.longitude] - Longitude
 * @body    {number} [waitTime] - Wait time in seconds
 * 
 * @returns {Object} Updated ride status
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/arrive
 * Authorization: Bearer <token>
 * Body: { "location": { "latitude": 34.05, "longitude": -118.25 } }
 */
router.put(
    '/rides/:rideId/arrive',
    validate(driverValidation.arriveRide),
    asyncHandler(driverRideController.arriveAtPickup)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/start
 * @desc    Start the ride (begin trip)
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {Object} [startLocation] - Starting location
 * @body    {number} [startLocation.latitude] - Latitude
 * @body    {number} [startLocation.longitude] - Longitude
 * @body    {number} [odometer] - Vehicle odometer reading
 * 
 * @returns {Object} Started ride details
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/start
 * Authorization: Bearer <token>
 * Body: { "odometer": 45000 }
 */
router.put(
    '/rides/:rideId/start',
    validate(driverValidation.startRide),
    asyncHandler(driverRideController.startRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/complete
 * @desc    Complete the ride (end trip)
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {Object} [endLocation] - Ending location
 * @body    {number} [endLocation.latitude] - Latitude
 * @body    {number} [endLocation.longitude] - Longitude
 * @body    {number} [distance] - Total distance in kilometers
 * @body    {number} [duration] - Total ride duration in minutes
 * @body    {number} [fare] - Final fare amount
 * @body    {number} [odometer] - Vehicle odometer reading
 * @body    {string} [paymentMethod] - Payment method used
 * @body    {Object} [rating] - Driver's rating of rider
 * 
 * @returns {Object} Completed ride with fare breakdown
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/complete
 * Authorization: Bearer <token>
 * Body: {
 *   "distance": 5.2,
 *   "duration": 15,
 *   "fare": 15.50,
 *   "paymentMethod": "wallet",
 *   "rating": { "rider": 5 }
 * }
 */
router.put(
    '/rides/:rideId/complete',
    validate(driverValidation.completeRide),
    asyncHandler(driverRideController.completeRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/cancel
 * @desc    Cancel an active ride
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {string} reason - Cancellation reason
 * @body    {string} [reasonCode] - Reason code
 * @body    {Object} [location] - Driver's location
 * 
 * @returns {Object} Cancellation confirmation with penalty details if any
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/cancel
 * Authorization: Bearer <token>
 * Body: { "reason": "Vehicle breakdown", "reasonCode": "vehicle_issue" }
 */
router.put(
    '/rides/:rideId/cancel',
    validate(driverValidation.cancelRide),
    asyncHandler(driverRideController.cancelRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/reroute
 * @desc    Reroute during active ride (change destination)
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {Object} newDestination - New destination location
 * @body    {number} newDestination.latitude - Latitude
 * @body    {number} newDestination.longitude - Longitude
 * @body    {string} newDestination.address - Address
 * @body    {string} [reason] - Reroute reason
 * 
 * @returns {Object} Updated ride with new route
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/reroute
 * Authorization: Bearer <token>
 * Body: {
 *   "newDestination": { "latitude": 34.10, "longitude": -118.30, "address": "456 New St" },
 *   "reason": "Rider changed destination"
 * }
 */
router.put(
    '/rides/:rideId/reroute',
    validate(driverValidation.rerouteRide),
    asyncHandler(driverRideController.rerouteRide)
);

/**
 * @route   PUT /api/v1/drivers/rides/:rideId/wait
 * @desc    Update waiting time for a ride
 * @access  Private (Driver)
 * 
 * @param   {string} rideId - Ride ID
 * @body    {number} waitTime - Wait time in minutes
 * @body    {string} [status] - Wait status (waiting/ready)
 * 
 * @returns {Object} Updated ride with wait time
 * 
 * @example
 * PUT /api/v1/drivers/rides/rid_123/wait
 * Authorization: Bearer <token>
 * Body: { "waitTime": 5, "status": "waiting" }
 */
router.put(
    '/rides/:rideId/wait',
    validate(driverValidation.updateWaitTime),
    asyncHandler(driverRideController.updateWaitTime)
);

// =============================================================================
// SECTION 4: EARNINGS & FINANCIALS
// =============================================================================

/**
 * @route   GET /api/v1/drivers/earnings
 * @desc    Get driver earnings summary
 * @access  Private (Driver)
 * @cache   5 minutes
 * 
 * @queryParam {string} [period=week] - Period (day/week/month/year/all)
 * @queryParam {string} [startDate] - Custom start date (ISO format)
 * @queryParam {string} [endDate] - Custom end date (ISO format)
 * @queryParam {string} [currency] - Currency code (default: USD)
 * @queryParam {string} [groupBy] - Group by (day/week/month)
 * 
 * @returns {Object} Earnings summary:
 *   - total: total earnings
 *   - average: average per ride
 *   - chartData: { labels, values }
 *   - breakdown: { byDay, byWeek, byMonth }
 *   - pending: pending earnings
 *   - paid: paid earnings
 * 
 * @example
 * GET /api/v1/drivers/earnings?period=month&groupBy=week
 * Authorization: Bearer <token>
 */
router.get(
    '/earnings',
    rateLimiter(RATE_LIMITS.EARNINGS_REQUEST),
    cacheMiddleware({ ttl: CACHE_TTL.EARNINGS }),
    validate(driverValidation.getEarnings),
    asyncHandler(driverEarningsController.getEarnings)
);

/**
 * @route   GET /api/v1/drivers/earnings/details
 * @desc    Get detailed earnings breakdown
 * @access  Private (Driver)
 * 
 * @queryParam {string} [period=week] - Earnings period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=50] - Items per page
 * 
 * @returns {Object} Detailed earnings breakdown:
 *   - rides: Array of ride earnings
 *   - summary: { total, count, average }
 *   - pagination: { page, limit, total, pages }
 * 
 * @example
 * GET /api/v1/drivers/earnings/details?period=week&page=1
 * Authorization: Bearer <token>
 */
router.get(
    '/earnings/details',
    validate(driverValidation.getEarningsDetails),
    asyncHandler(driverEarningsController.getEarningsDetails)
);

/**
 * @route   GET /api/v1/drivers/earnings/chart
 * @desc    Get earnings chart data
 * @access  Private (Driver)
 * @cache   5 minutes
 * 
 * @queryParam {string} [period=week] - Period (day/week/month/year)
 * @queryParam {string} [chartType=line] - Chart type (line/bar/area)
 * @queryParam {number} [limit=30] - Data points limit
 * 
 * @returns {Object} Chart data:
 *   - labels: Array of labels
 *   - datasets: Array of dataset objects
 *   - summary: { total, average, trend }
 * 
 * @example
 * GET /api/v1/drivers/earnings/chart?period=month&chartType=bar
 * Authorization: Bearer <token>
 */
router.get(
    '/earnings/chart',
    cacheMiddleware({ ttl: CACHE_TTL.EARNINGS }),
    validate(driverValidation.getEarningsChart),
    asyncHandler(driverEarningsController.getEarningsChart)
);

/**
 * @route   GET /api/v1/drivers/earnings/payout-history
 * @desc    Get payout history
 * @access  Private (Driver)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status (pending/processing/completed/failed)
 * @queryParam {string} [method] - Filter by payout method
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated payout history
 * 
 * @example
 * GET /api/v1/drivers/earnings/payout-history?page=1&status=completed
 * Authorization: Bearer <token>
 */
router.get(
    '/earnings/payout-history',
    validate(driverValidation.getPayoutHistory),
    asyncHandler(driverEarningsController.getPayoutHistory)
);

/**
 * @route   POST /api/v1/drivers/earnings/request-payout
 * @desc    Request a payout
 * @access  Private (Driver)
 * @rateLimit 2 requests per minute
 * 
 * @body    {number} amount - Amount to withdraw
 * @body    {string} method - Payout method (mpesa/ecocash/bank)
 * @body    {string} account - Account details
 * @body    {string} [reference] - Reference ID
 * @body    {string} [notes] - Additional notes
 * 
 * @returns {Object} Payout request confirmation
 * 
 * @example
 * POST /api/v1/drivers/earnings/request-payout
 * Authorization: Bearer <token>
 * Body: {
 *   "amount": 100.00,
 *   "method": "mpesa",
 *   "account": "254712345678",
 *   "notes": "Weekly payout"
 * }
 */
router.post(
    '/earnings/request-payout',
    rateLimiter({ windowMs: 60000, max: 2 }),
    validate(driverValidation.requestPayout),
    asyncHandler(driverEarningsController.requestPayout)
);

/**
 * @route   GET /api/v1/drivers/earnings/payout-methods
 * @desc    Get available payout methods
 * @access  Private (Driver)
 * @cache   1 hour
 * 
 * @returns {Object} Available payout methods with details
 * 
 * @example
 * GET /api/v1/drivers/earnings/payout-methods
 * Authorization: Bearer <token>
 */
router.get(
    '/earnings/payout-methods',
    cacheMiddleware({ ttl: 3600 }),
    asyncHandler(driverEarningsController.getPayoutMethods)
);

/**
 * @route   POST /api/v1/drivers/earnings/payout-methods
 * @desc    Add a payout method
 * @access  Private (Driver)
 * 
 * @body    {string} method - Method type (mpesa/ecocash/bank)
 * @body    {Object} details - Method specific details
 * @body    {boolean} [default] - Set as default method
 * 
 * @returns {Object} Added payout method
 * 
 * @example
 * POST /api/v1/drivers/earnings/payout-methods
 * Authorization: Bearer <token>
 * Body: {
 *   "method": "mpesa",
 *   "details": { "phoneNumber": "254712345678" },
 *   "default": true
 * }
 */
router.post(
    '/earnings/payout-methods',
    validate(driverValidation.addPayoutMethod),
    asyncHandler(driverEarningsController.addPayoutMethod)
);

/**
 * @route   DELETE /api/v1/drivers/earnings/payout-methods/:id
 * @desc    Remove a payout method
 * @access  Private (Driver)
 * 
 * @param   {string} id - Payout method ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/earnings/payout-methods/pm_123
 * Authorization: Bearer <token>
 */
router.delete(
    '/earnings/payout-methods/:id',
    validate(driverValidation.removePayoutMethod),
    asyncHandler(driverEarningsController.removePayoutMethod)
);

// =============================================================================
// SECTION 5: VEHICLE MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/vehicle
 * @desc    Get driver's vehicle details
 * @access  Private (Driver)
 * @cache   1 minute
 * 
 * @returns {Object} Vehicle details:
 *   - id, make, model, year
 *   - licensePlate, color, capacity
 *   - vehicleType, category
 *   - documents: { registration, insurance, inspection }
 *   - status: { verified, active }
 *   - features: [AC, GPS, childSeat, etc.]
 *   - photos: Array of photo URLs
 * 
 * @example
 * GET /api/v1/drivers/vehicle
 * Authorization: Bearer <token>
 */
router.get(
    '/vehicle',
    cacheMiddleware({ ttl: CACHE_TTL.VEHICLE }),
    asyncHandler(driverVehicleController.getVehicle)
);

/**
 * @route   PUT /api/v1/drivers/vehicle
 * @desc    Update driver's vehicle details
 * @access  Private (Driver)
 * @invalidateCache /api/v1/drivers/vehicle
 * 
 * @body    {string} [make] - Vehicle make
 * @body    {string} [model] - Vehicle model
 * @body    {number} [year] - Vehicle year
 * @body    {string} [licensePlate] - License plate number
 * @body    {string} [color] - Vehicle color
 * @body    {number} [capacity] - Passenger capacity
 * @body    {string} [vehicleType] - Vehicle type (standard/premium/XL/van)
 * @body    {string[]} [features] - Vehicle features list
 * @body    {string} [category] - Vehicle category
 * @body    {string} [transmission] - Transmission type (automatic/manual)
 * @body    {string} [fuelType] - Fuel type (petrol/diesel/electric/hybrid)
 * 
 * @returns {Object} Updated vehicle details
 * 
 * @example
 * PUT /api/v1/drivers/vehicle
 * Authorization: Bearer <token>
 * Body: {
 *   "make": "Toyota",
 *   "model": "Camry",
 *   "year": 2020,
 *   "licensePlate": "ABC 1234",
 *   "color": "Black",
 *   "capacity": 4,
 *   "features": ["AC", "GPS", "Child Seat"]
 * }
 */
router.put(
    '/vehicle',
    invalidateCache('/api/v1/drivers/vehicle'),
    validate(driverValidation.updateVehicle),
    asyncHandler(driverVehicleController.updateVehicle)
);

/**
 * @route   PATCH /api/v1/drivers/vehicle
 * @desc    Partial update vehicle details
 * @access  Private (Driver)
 * 
 * @body    {Object} updates - Partial vehicle updates
 * @returns {Object} Updated vehicle details
 * 
 * @example
 * PATCH /api/v1/drivers/vehicle
 * Authorization: Bearer <token>
 * Body: { "color": "Red", "features": ["AC", "GPS"] }
 */
router.patch(
    '/vehicle',
    invalidateCache('/api/v1/drivers/vehicle'),
    validate(driverValidation.partialUpdateVehicle),
    asyncHandler(driverVehicleController.partialUpdateVehicle)
);

/**
 * @route   POST /api/v1/drivers/vehicle/photos
 * @desc    Upload vehicle photos
 * @access  Private (Driver)
 * @rateLimit 5 requests per minute
 * 
 * @formData {File[]} photos - Vehicle photos (max 10)
 * @formData {string} [primary] - Index of primary photo
 * @formData {string} [angle] - Photo angle (front/rear/side/interior)
 * 
 * @returns {Object} Uploaded photo URLs
 * 
 * @example
 * POST /api/v1/drivers/vehicle/photos
 * Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * formData: { "photos": [file1, file2], "primary": "0" }
 */
router.post(
    '/vehicle/photos',
    rateLimiter(RATE_LIMITS.DOCUMENT_UPLOAD),
    upload.array('photos', 10),
    handleUploadError,
    validate(driverValidation.uploadVehiclePhotos),
    asyncHandler(driverVehicleController.uploadVehiclePhotos)
);

/**
 * @route   DELETE /api/v1/drivers/vehicle/photos/:photoId
 * @desc    Delete vehicle photo
 * @access  Private (Driver)
 * 
 * @param   {string} photoId - Photo ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/vehicle/photos/photo_123
 * Authorization: Bearer <token>
 */
router.delete(
    '/vehicle/photos/:photoId',
    asyncHandler(driverVehicleController.deleteVehiclePhoto)
);

/**
 * @route   POST /api/v1/drivers/vehicle/documents
 * @desc    Upload vehicle documents
 * @access  Private (Driver)
 * @rateLimit 5 requests per minute
 * 
 * @formData {File} registration - Vehicle registration certificate
 * @formData {File} insurance - Insurance certificate
 * @formData {File} inspection - Vehicle inspection report
 * @formData {File} [logbook] - Vehicle logbook
 * @formData {string} [notes] - Additional notes
 * @formData {string} [expiryDate] - Document expiry date
 * 
 * @returns {Object} Uploaded document details
 * 
 * @example
 * POST /api/v1/drivers/vehicle/documents
 * Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * formData: {
 *   "registration": [file],
 *   "insurance": [file],
 *   "expiryDate": "2025-12-31"
 * }
 */
router.post(
    '/vehicle/documents',
    rateLimiter(RATE_LIMITS.DOCUMENT_UPLOAD),
    upload.fields([
        { name: 'registration', maxCount: 1 },
        { name: 'insurance', maxCount: 1 },
        { name: 'inspection', maxCount: 1 },
        { name: 'logbook', maxCount: 1 }
    ]),
    handleUploadError,
    validate(driverValidation.uploadVehicleDocuments),
    asyncHandler(driverVehicleController.uploadVehicleDocuments)
);

/**
 * @route   GET /api/v1/drivers/vehicle/documents
 * @desc    Get vehicle documents
 * @access  Private (Driver)
 * 
 * @returns {Object} List of vehicle documents
 * 
 * @example
 * GET /api/v1/drivers/vehicle/documents
 * Authorization: Bearer <token>
 */
router.get(
    '/vehicle/documents',
    asyncHandler(driverVehicleController.getVehicleDocuments)
);

/**
 * @route   DELETE /api/v1/drivers/vehicle/documents/:docId
 * @desc    Delete vehicle document
 * @access  Private (Driver)
 * 
 * @param   {string} docId - Document ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/vehicle/documents/doc_123
 * Authorization: Bearer <token>
 */
router.delete(
    '/vehicle/documents/:docId',
    validate(driverValidation.deleteVehicleDocument),
    asyncHandler(driverVehicleController.deleteVehicleDocument)
);

/**
 * @route   PUT /api/v1/drivers/vehicle/documents/:docId/verify
 * @desc    Verify vehicle document (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} docId - Document ID
 * @body    {string} status - Verification status (verified/rejected)
 * @body    {string} [notes] - Verification notes
 * 
 * @returns {Object} Updated document status
 * 
 * @example
 * PUT /api/v1/drivers/vehicle/documents/doc_123/verify
 * Authorization: Bearer <admin_token>
 * Body: { "status": "verified", "notes": "All documents verified" }
 */
router.put(
    '/vehicle/documents/:docId/verify',
    authorizeRoles('admin'),
    validate(driverValidation.verifyVehicleDocument),
    asyncHandler(driverVehicleController.verifyVehicleDocument)
);

// =============================================================================
// SECTION 6: AVAILABLE RIDES & MATCHING
// =============================================================================

/**
 * @route   GET /api/v1/drivers/available-rides
 * @desc    Get available rides in driver's area
 * @access  Private (Driver)
 * @cache   5 seconds
 * 
 * @queryParam {number} [latitude] - Driver's latitude (optional)
 * @queryParam {number} [longitude] - Driver's longitude (optional)
 * @queryParam {number} [radius=10] - Search radius in kilometers
 * @queryParam {number} [limit=20] - Maximum number of rides
 * @queryParam {string} [sortBy=distance] - Sort by (distance/rating/fare)
 * @queryParam {string} [vehicleType] - Filter by vehicle type
 * @queryParam {number} [minFare] - Minimum fare filter
 * @queryParam {number} [maxFare] - Maximum fare filter
 * 
 * @returns {Object} List of available rides with:
 *   - rides: Array of ride objects
 *   - summary: { total, averageDistance, averageFare }
 * 
 * @example
 * GET /api/v1/drivers/available-rides?latitude=34.05&longitude=-118.25&radius=5
 * Authorization: Bearer <token>
 */
router.get(
    '/available-rides',
    cacheMiddleware({ ttl: CACHE_TTL.AVAILABLE_RIDES }),
    validate(driverValidation.getAvailableRides),
    asyncHandler(driverController.getAvailableRides)
);

/**
 * @route   POST /api/v1/drivers/available-rides/matching
 * @desc    Get ride matching suggestions based on driver preferences
 * @access  Private (Driver)
 * 
 * @body    {number} latitude - Driver's current latitude
 * @body    {number} longitude - Driver's current longitude
 * @body    {number} [radius=10] - Search radius in kilometers
 * @body    {string} [preference] - Matching preference (speed/revenue/rating)
 * @body    {string} [vehicleType] - Preferred vehicle type
 * @body    {number} [limit=10] - Maximum suggestions
 * 
 * @returns {Object} Matching suggestions with priority scores
 * 
 * @example
 * POST /api/v1/drivers/available-rides/matching
 * Authorization: Bearer <token>
 * Body: {
 *   "latitude": 34.05,
 *   "longitude": -118.25,
 *   "preference": "revenue",
 *   "limit": 5
 * }
 */
router.post(
    '/available-rides/matching',
    validate(driverValidation.getMatchingSuggestions),
    asyncHandler(driverController.getMatchingSuggestions)
);

/**
 * @route   GET /api/v1/drivers/available-rides/stats
 * @desc    Get availability statistics
 * @access  Private (Driver)
 * 
 * @queryParam {string} [period=day] - Period (day/week/month)
 * @returns {Object} Availability stats:
 *   - totalAvailable: total available rides
 *   - averageWait: average wait time
 *   - busyPeriods: peak demand periods
 * 
 * @example
 * GET /api/v1/drivers/available-rides/stats?period=week
 * Authorization: Bearer <token>
 */
router.get(
    '/available-rides/stats',
    cacheMiddleware({ ttl: 300 }),
    validate(driverValidation.getAvailabilityStats),
    asyncHandler(driverController.getAvailabilityStats)
);

// =============================================================================
// SECTION 7: LOCATION & TRACKING
// =============================================================================

/**
 * @route   POST /api/v1/drivers/location
 * @desc    Update driver's current location
 * @access  Private (Driver)
 * @rateLimit 5 requests per second
 * 
 * @body    {number} latitude - Current latitude
 * @body    {number} longitude - Current longitude
 * @body    {number} [accuracy] - Location accuracy in meters
 * @body    {number} [heading] - Heading in degrees
 * @body    {number} [speed] - Speed in m/s
 * @body    {number} [altitude] - Altitude in meters
 * @body    {string} [timestamp] - Timestamp of location fix
 * @body    {string} [provider] - Location provider (gps/network)
 * 
 * @returns {Object} Location update confirmation
 * 
 * @example
 * POST /api/v1/drivers/location
 * Authorization: Bearer <token>
 * Body: {
 *   "latitude": 34.05,
 *   "longitude": -118.25,
 *   "accuracy": 10,
 *   "heading": 180,
 *   "speed": 12.5
 * }
 */
router.post(
    '/location',
    rateLimiter(RATE_LIMITS.LOCATION_UPDATE),
    validate(driverValidation.updateLocation),
    asyncHandler(driverController.updateLocation)
);

/**
 * @route   GET /api/v1/drivers/location/history
 * @desc    Get driver's location history
 * @access  Private (Driver/Admin)
 * 
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {number} [limit=100] - Max entries
 * @queryParam {number} [skip=0] - Skip entries
 * 
 * @returns {Object} Location history array
 * 
 * @example
 * GET /api/v1/drivers/location/history?startDate=2024-01-01&limit=50
 * Authorization: Bearer <token>
 */
router.get(
    '/location/history',
    validate(driverValidation.getLocationHistory),
    asyncHandler(driverController.getLocationHistory)
);

/**
 * @route   POST /api/v1/drivers/location/batch
 * @desc    Batch update locations (for offline sync)
 * @access  Private (Driver)
 * @rateLimit 1 request per minute
 * 
 * @body    {Array} locations - Array of location objects
 * @body    {number} locations[].latitude - Latitude
 * @body    {number} locations[].longitude - Longitude
 * @body    {string} locations[].timestamp - ISO timestamp
 * 
 * @returns {Object} Batch update confirmation
 * 
 * @example
 * POST /api/v1/drivers/location/batch
 * Authorization: Bearer <token>
 * Body: {
 *   "locations": [
 *     { "latitude": 34.05, "longitude": -118.25, "timestamp": "2024-01-15T10:00:00Z" },
 *     { "latitude": 34.06, "longitude": -118.26, "timestamp": "2024-01-15T10:01:00Z" }
 *   ]
 * }
 */
router.post(
    '/location/batch',
    rateLimiter({ windowMs: 60000, max: 1 }),
    validate(driverValidation.batchUpdateLocations),
    asyncHandler(driverController.batchUpdateLocations)
);

// =============================================================================
// SECTION 8: GEOFENCE
// =============================================================================

/**
 * @route   GET /api/v1/drivers/geofence
 * @desc    Check if driver is within a geofence
 * @access  Private (Driver)
 * 
 * @queryParam {number} latitude - Driver's latitude
 * @queryParam {number} longitude - Driver's longitude
 * @queryParam {string} [zoneId] - Specific zone ID to check
 * @queryParam {string} [zoneType] - Zone type (restricted/preferred/bonus)
 * 
 * @returns {Object} Geofence status:
 *   - inside: boolean
 *   - zone: { id, name, type, boundary }
 *   - distanceToBorder: distance in meters
 * 
 * @example
 * GET /api/v1/drivers/geofence?latitude=34.05&longitude=-118.25
 * Authorization: Bearer <token>
 */
router.get(
    '/geofence',
    validate(driverValidation.checkGeofence),
    asyncHandler(driverController.checkGeofence)
);

/**
 * @route   GET /api/v1/drivers/geofence/zones
 * @desc    Get all geofence zones near driver
 * @access  Private (Driver)
 * 
 * @queryParam {number} latitude - Driver's latitude
 * @queryParam {number} longitude - Driver's longitude
 * @queryParam {number} [radius=10] - Search radius in km
 * 
 * @returns {Object} List of nearby zones
 * 
 * @example
 * GET /api/v1/drivers/geofence/zones?latitude=34.05&longitude=-118.25
 * Authorization: Bearer <token>
 */
router.get(
    '/geofence/zones',
    validate(driverValidation.getNearbyZones),
    asyncHandler(driverController.getNearbyZones)
);

// =============================================================================
// SECTION 9: RATINGS & REVIEWS
// =============================================================================

/**
 * @route   GET /api/v1/drivers/ratings
 * @desc    Get driver's rating summary
 * @access  Private (Driver)
 * @cache   5 minutes
 * 
 * @returns {Object} Rating summary:
 *   - average: average rating
 *   - total: total number of ratings
 *   - distribution: { 1: count, 2: count, 3: count, 4: count, 5: count }
 *   - recent: recent ratings
 *   - trend: rating trend over time
 * 
 * @example
 * GET /api/v1/drivers/ratings
 * Authorization: Bearer <token>
 */
router.get(
    '/ratings',
    cacheMiddleware({ ttl: CACHE_TTL.RATINGS }),
    asyncHandler(driverController.getRatings)
);

/**
 * @route   GET /api/v1/drivers/reviews
 * @desc    Get driver's reviews with pagination
 * @access  Private (Driver)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {number} [minRating] - Minimum rating filter
 * @queryParam {number} [maxRating] - Maximum rating filter
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order
 * @queryParam {string} [search] - Search in review text
 * 
 * @returns {Object} Paginated reviews:
 *   - reviews: Array of review objects
 *   - pagination: { page, limit, total, pages }
 *   - summary: { average, total, distribution }
 * 
 * @example
 * GET /api/v1/drivers/reviews?page=1&minRating=4&limit=10
 * Authorization: Bearer <token>
 */
router.get(
    '/reviews',
    validate(driverValidation.getReviews),
    asyncHandler(driverController.getReviews)
);

/**
 * @route   POST /api/v1/drivers/reviews/:reviewId/response
 * @desc    Respond to a review
 * @access  Private (Driver)
 * 
 * @param   {string} reviewId - Review ID
 * @body    {string} response - Response text
 * @body    {string} [visibility] - Response visibility (public/private)
 * 
 * @returns {Object} Updated review with response
 * 
 * @example
 * POST /api/v1/drivers/reviews/rev_123/response
 * Authorization: Bearer <token>
 * Body: { "response": "Thank you for your feedback!", "visibility": "public" }
 */
router.post(
    '/reviews/:reviewId/response',
    validate(driverValidation.respondToReview),
    asyncHandler(driverController.respondToReview)
);

/**
 * @route   DELETE /api/v1/drivers/reviews/:reviewId/response
 * @desc    Delete review response
 * @access  Private (Driver)
 * 
 * @param   {string} reviewId - Review ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/reviews/rev_123/response
 * Authorization: Bearer <token>
 */
router.delete(
    '/reviews/:reviewId/response',
    validate(driverValidation.deleteReviewResponse),
    asyncHandler(driverController.deleteReviewResponse)
);

// =============================================================================
// SECTION 10: DOCUMENT MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/documents
 * @desc    Get driver's documents
 * @access  Private (Driver)
 * 
 * @returns {Object} List of documents:
 *   - documents: Array of document objects
 *   - summary: { total, verified, pending, rejected }
 * 
 * @example
 * GET /api/v1/drivers/documents
 * Authorization: Bearer <token>
 */
router.get(
    '/documents',
    asyncHandler(driverDocumentController.getDocuments)
);

/**
 * @route   POST /api/v1/drivers/documents
 * @desc    Upload driver documents
 * @access  Private (Driver)
 * @rateLimit 5 requests per minute
 * 
 * @formData {File} license - Driver's license
 * @formData {File} id - National ID or passport
 * @formData {File} profilePhoto - Profile photo
 * @formData {File} [backgroundCheck] - Background check report
 * @formData {string} [documentType] - Document type
 * @formData {string} [notes] - Additional notes
 * @formData {string} [expiryDate] - Document expiry date
 * 
 * @returns {Object} Uploaded document details
 * 
 * @example
 * POST /api/v1/drivers/documents
 * Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * formData: {
 *   "license": [file],
 *   "id": [file],
 *   "profilePhoto": [file],
 *   "expiryDate": "2025-12-31"
 * }
 */
router.post(
    '/documents',
    rateLimiter(RATE_LIMITS.DOCUMENT_UPLOAD),
    upload.fields([
        { name: 'license', maxCount: 1 },
        { name: 'id', maxCount: 1 },
        { name: 'profilePhoto', maxCount: 1 },
        { name: 'backgroundCheck', maxCount: 1 }
    ]),
    handleUploadError,
    validate(driverValidation.uploadDocuments),
    asyncHandler(driverDocumentController.uploadDocuments)
);

/**
 * @route   GET /api/v1/drivers/documents/:id/download
 * @desc    Download a document
 * @access  Private (Driver)
 * 
 * @param   {string} id - Document ID
 * @returns {File} Document file
 * 
 * @example
 * GET /api/v1/drivers/documents/doc_123/download
 * Authorization: Bearer <token>
 */
router.get(
    '/documents/:id/download',
    validate(driverValidation.getDocumentById),
    asyncHandler(driverDocumentController.downloadDocument)
);

/**
 * @route   DELETE /api/v1/drivers/documents/:id
 * @desc    Delete a document
 * @access  Private (Driver)
 * 
 * @param   {string} id - Document ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/documents/doc_123
 * Authorization: Bearer <token>
 */
router.delete(
    '/documents/:id',
    validate(driverValidation.deleteDocument),
    asyncHandler(driverDocumentController.deleteDocument)
);

/**
 * @route   PUT /api/v1/drivers/documents/:id/rename
 * @desc    Rename a document
 * @access  Private (Driver)
 * 
 * @param   {string} id - Document ID
 * @body    {string} name - New document name
 * 
 * @returns {Object} Updated document
 * 
 * @example
 * PUT /api/v1/drivers/documents/doc_123/rename
 * Authorization: Bearer <token>
 * Body: { "name": "Updated License.pdf" }
 */
router.put(
    '/documents/:id/rename',
    validate(driverValidation.renameDocument),
    asyncHandler(driverDocumentController.renameDocument)
);

/**
 * @route   POST /api/v1/drivers/documents/:id/share
 * @desc    Share a document with admin/support
 * @access  Private (Driver)
 * 
 * @param   {string} id - Document ID
 * @body    {string[]} recipients - Recipient IDs
 * @body    {string} [message] - Share message
 * @body    {string} [expiry] - Share expiry (1h/24h/7d)
 * 
 * @returns {Object} Share confirmation with secure link
 * 
 * @example
 * POST /api/v1/drivers/documents/doc_123/share
 * Authorization: Bearer <token>
 * Body: { "recipients": ["admin_123"], "message": "Please verify", "expiry": "24h" }
 */
router.post(
    '/documents/:id/share',
    validate(driverValidation.shareDocument),
    asyncHandler(driverDocumentController.shareDocument)
);

// =============================================================================
// SECTION 11: SETTINGS & NOTIFICATIONS
// =============================================================================

/**
 * @route   GET /api/v1/drivers/settings
 * @desc    Get driver settings
 * @access  Private (Driver)
 * @cache   5 minutes
 * 
 * @returns {Object} Driver settings:
 *   - notificationPreferences: { push, email, sms }
 *   - ridePreferences: { autoAccept, maxDistance, vehicleTypes }
 *   - privacySettings: { shareLocation, showOnline }
 *   - paymentSettings: { defaultMethod, autoWithdraw }
 * 
 * @example
 * GET /api/v1/drivers/settings
 * Authorization: Bearer <token>
 */
router.get(
    '/settings',
    cacheMiddleware({ ttl: CACHE_TTL.SETTINGS }),
    asyncHandler(driverController.getSettings)
);

/**
 * @route   PUT /api/v1/drivers/settings
 * @desc    Update driver settings
 * @access  Private (Driver)
 * @invalidateCache /api/v1/drivers/settings
 * 
 * @body    {Object} [notificationPreferences] - Notification preferences
 * @body    {Object} [ridePreferences] - Ride preferences
 * @body    {Object} [privacySettings] - Privacy settings
 * @body    {Object} [paymentSettings] - Payment settings
 * @body    {Object} [scheduleSettings] - Work schedule settings
 * 
 * @returns {Object} Updated settings
 * 
 * @example
 * PUT /api/v1/drivers/settings
 * Authorization: Bearer <token>
 * Body: {
 *   "notificationPreferences": { "newRide": true, "reminder": false },
 *   "ridePreferences": { "autoAccept": false, "maxDistance": 15 }
 * }
 */
router.put(
    '/settings',
    invalidateCache('/api/v1/drivers/settings'),
    validate(driverValidation.updateSettings),
    asyncHandler(driverController.updateSettings)
);

/**
 * @route   PATCH /api/v1/drivers/settings
 * @desc    Partial update driver settings
 * @access  Private (Driver)
 * 
 * @body    {Object} updates - Partial settings updates
 * @returns {Object} Updated settings
 * 
 * @example
 * PATCH /api/v1/drivers/settings
 * Authorization: Bearer <token>
 * Body: { "notificationPreferences": { "newRide": false } }
 */
router.patch(
    '/settings',
    invalidateCache('/api/v1/drivers/settings'),
    validate(driverValidation.partialUpdateSettings),
    asyncHandler(driverController.partialUpdateSettings)
);

/**
 * @route   GET /api/v1/drivers/notifications
 * @desc    Get driver's notifications
 * @access  Private (Driver)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {boolean} [unreadOnly] - Only unread notifications
 * @queryParam {string} [type] - Notification type filter
 * @queryParam {string} [priority] - Priority filter
 * 
 * @returns {Object} Paginated notifications
 * 
 * @example
 * GET /api/v1/drivers/notifications?unreadOnly=true&page=1
 * Authorization: Bearer <token>
 */
router.get(
    '/notifications',
    validate(driverValidation.getNotifications),
    asyncHandler(driverController.getNotifications)
);

/**
 * @route   PATCH /api/v1/drivers/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private (Driver)
 * 
 * @param   {string} id - Notification ID
 * @returns {Object} Updated notification
 * 
 * @example
 * PATCH /api/v1/drivers/notifications/not_123/read
 * Authorization: Bearer <token>
 */
router.patch(
    '/notifications/:id/read',
    validate(driverValidation.markNotificationRead),
    asyncHandler(driverController.markNotificationRead)
);

/**
 * @route   PATCH /api/v1/drivers/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private (Driver)
 * 
 * @returns {Object} Update confirmation
 * 
 * @example
 * PATCH /api/v1/drivers/notifications/read-all
 * Authorization: Bearer <token>
 */
router.patch(
    '/notifications/read-all',
    asyncHandler(driverController.markAllNotificationsRead)
);

/**
 * @route   DELETE /api/v1/drivers/notifications/:id
 * @desc    Delete a notification
 * @access  Private (Driver)
 * 
 * @param   {string} id - Notification ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/notifications/not_123
 * Authorization: Bearer <token>
 */
router.delete(
    '/notifications/:id',
    validate(driverValidation.deleteNotification),
    asyncHandler(driverController.deleteNotification)
);

/**
 * @route   DELETE /api/v1/drivers/notifications/clear-all
 * @desc    Clear all notifications
 * @access  Private (Driver)
 * 
 * @returns {Object} Clear confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/notifications/clear-all
 * Authorization: Bearer <token>
 */
router.delete(
    '/notifications/clear-all',
    asyncHandler(driverController.clearAllNotifications)
);

// =============================================================================
// SECTION 12: STATISTICS & ANALYTICS
// =============================================================================

/**
 * @route   GET /api/v1/drivers/statistics
 * @desc    Get comprehensive driver statistics
 * @access  Private (Driver)
 * @cache   1 minute
 * 
 * @queryParam {string} [period=week] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Comprehensive statistics:
 *   - rideStats: { total, completed, cancelled, averageDistance, averageDuration }
 *   - revenueStats: { total, average, peakPeriod, byDay }
 *   - ratingStats: { average, total, distribution, trend }
 *   - performance: { acceptanceRate, completionRate, responseTime, utilization }
 *   - comparison: { vsPrevious, vsAverage }
 * 
 * @example
 * GET /api/v1/drivers/statistics?period=month
 * Authorization: Bearer <token>
 */
router.get(
    '/statistics',
    cacheMiddleware({ ttl: CACHE_TTL.STATISTICS }),
    validate(driverValidation.getStatistics),
    asyncHandler(driverAnalyticsController.getStatistics)
);

/**
 * @route   GET /api/v1/drivers/statistics/performance
 * @desc    Get driver performance metrics
 * @access  Private (Driver)
 * 
 * @queryParam {string} [period=week] - Performance period
 * @returns {Object} Performance metrics
 * 
 * @example
 * GET /api/v1/drivers/statistics/performance?period=week
 * Authorization: Bearer <token>
 */
router.get(
    '/statistics/performance',
    cacheMiddleware({ ttl: 300 }),
    validate(driverValidation.getPerformanceStats),
    asyncHandler(driverAnalyticsController.getPerformanceStats)
);

/**
 * @route   GET /api/v1/drivers/statistics/comparison
 * @desc    Compare driver stats with peers
 * @access  Private (Driver)
 * 
 * @queryParam {string} [period=week] - Comparison period
 * @returns {Object} Comparison stats
 * 
 * @example
 * GET /api/v1/drivers/statistics/comparison?period=month
 * Authorization: Bearer <token>
 */
router.get(
    '/statistics/comparison',
    cacheMiddleware({ ttl: 300 }),
    validate(driverValidation.getComparisonStats),
    asyncHandler(driverAnalyticsController.getComparisonStats)
);

/**
 * @route   GET /api/v1/drivers/statistics/insights
 * @desc    Get AI-powered insights
 * @access  Private (Driver)
 * 
 * @returns {Object} Insights:
 *   - suggestions: tips to improve performance
 *   - trends: identified patterns
 *   - alerts: important notifications
 * 
 * @example
 * GET /api/v1/drivers/statistics/insights
 * Authorization: Bearer <token>
 */
router.get(
    '/statistics/insights',
    cacheMiddleware({ ttl: 300 }),
    asyncHandler(driverAnalyticsController.getInsights)
);

// =============================================================================
// SECTION 13: FLEET MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers/fleet
 * @desc    Get driver's fleet information
 * @access  Private (Driver)
 * 
 * @returns {Object} Fleet details
 * 
 * @example
 * GET /api/v1/drivers/fleet
 * Authorization: Bearer <token>
 */
router.get(
    '/fleet',
    asyncHandler(driverController.getFleetInfo)
);

/**
 * @route   GET /api/v1/drivers/fleet/vehicles
 * @desc    Get fleet vehicles
 * @access  Private (Driver/Fleet Manager)
 * 
 * @returns {Object} List of fleet vehicles
 * 
 * @example
 * GET /api/v1/drivers/fleet/vehicles
 * Authorization: Bearer <token>
 */
router.get(
    '/fleet/vehicles',
    authorizeRoles('driver', 'fleetManager'),
    asyncHandler(driverController.getFleetVehicles)
);

/**
 * @route   POST /api/v1/drivers/fleet/vehicles
 * @desc    Add vehicle to fleet
 * @access  Private (Fleet Manager only)
 * 
 * @body    {string} vehicleId - Vehicle ID
 * @body    {string} [driverId] - Assigned driver ID
 * @body    {Object} [details] - Assignment details
 * 
 * @returns {Object} Added vehicle confirmation
 * 
 * @example
 * POST /api/v1/drivers/fleet/vehicles
 * Authorization: Bearer <fleetManager_token>
 * Body: { "vehicleId": "veh_123", "driverId": "drv_456" }
 */
router.post(
    '/fleet/vehicles',
    authorizeRoles('admin', 'fleetManager'),
    validate(driverValidation.addFleetVehicle),
    asyncHandler(driverController.addFleetVehicle)
);

/**
 * @route   DELETE /api/v1/drivers/fleet/vehicles/:vehicleId
 * @desc    Remove vehicle from fleet
 * @access  Private (Fleet Manager only)
 * 
 * @param   {string} vehicleId - Vehicle ID
 * @returns {Object} Removal confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/fleet/vehicles/veh_123
 * Authorization: Bearer <fleetManager_token>
 */
router.delete(
    '/fleet/vehicles/:vehicleId',
    authorizeRoles('admin', 'fleetManager'),
    validate(driverValidation.removeFleetVehicle),
    asyncHandler(driverController.removeFleetVehicle)
);

// =============================================================================
// SECTION 14: ADMIN MANAGEMENT
// =============================================================================

/**
 * @route   GET /api/v1/drivers
 * @desc    List all drivers (admin only)
 * @access  Private (Admin only)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [search] - Search by name or email
 * @queryParam {string} [verificationStatus] - Filter by verification
 * @queryParam {string} [sortBy=createdAt] - Sort field
 * @queryParam {string} [sortOrder=desc] - Sort order
 * 
 * @returns {Object} Paginated driver list
 * 
 * @example
 * GET /api/v1/drivers?page=1&status=online&verificationStatus=verified
 * Authorization: Bearer <admin_token>
 */
router.get(
    '/',
    authorizeRoles('admin', 'manager'),
    validate(driverValidation.listDrivers),
    asyncHandler(driverController.listDrivers)
);

/**
 * @route   GET /api/v1/drivers/export
 * @desc    Export drivers data (admin only)
 * @access  Private (Admin only)
 * 
 * @queryParam {string} [format=csv] - Export format (csv/json/excel)
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {File} Exported file
 * 
 * @example
 * GET /api/v1/drivers/export?format=csv&status=active
 * Authorization: Bearer <admin_token>
 */
router.get(
    '/export',
    authorizeRoles('admin'),
    validate(driverValidation.exportDrivers),
    asyncHandler(driverController.exportDrivers)
);

/**
 * @route   GET /api/v1/drivers/:id
 * @desc    Get driver by ID (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} id - Driver ID
 * @returns {Object} Complete driver details
 * 
 * @example
 * GET /api/v1/drivers/drv_123
 * Authorization: Bearer <admin_token>
 */
router.get(
    '/:id',
    authorizeRoles('admin', 'manager'),
    validate(driverValidation.getDriverById),
    asyncHandler(driverController.getDriverById)
);

/**
 * @route   PATCH /api/v1/drivers/:id/verify
 * @desc    Verify a driver (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} id - Driver ID
 * @body    {string} status - Verification status (verified/rejected/pending)
 * @body    {string} [reason] - Rejection reason if applicable
 * @body    {string} [notes] - Verification notes
 * 
 * @returns {Object} Updated verification status
 * 
 * @example
 * PATCH /api/v1/drivers/drv_123/verify
 * Authorization: Bearer <admin_token>
 * Body: { "status": "verified", "notes": "All documents verified" }
 */
router.patch(
    '/:id/verify',
    authorizeRoles('admin'),
    validate(driverValidation.verifyDriver),
    asyncHandler(driverController.verifyDriver)
);

/**
 * @route   PATCH /api/v1/drivers/:id/suspend
 * @desc    Suspend a driver (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} id - Driver ID
 * @body    {string} reason - Suspension reason
 * @body    {number} [duration] - Suspension duration in days
 * @body    {string} [notes] - Additional notes
 * 
 * @returns {Object} Updated driver status
 * 
 * @example
 * PATCH /api/v1/drivers/drv_123/suspend
 * Authorization: Bearer <admin_token>
 * Body: { "reason": "Policy violation", "duration": 7 }
 */
router.patch(
    '/:id/suspend',
    authorizeRoles('admin'),
    validate(driverValidation.suspendDriver),
    asyncHandler(driverController.suspendDriver)
);

/**
 * @route   PATCH /api/v1/drivers/:id/activate
 * @desc    Activate a driver (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} id - Driver ID
 * @returns {Object} Updated driver status
 * 
 * @example
 * PATCH /api/v1/drivers/drv_123/activate
 * Authorization: Bearer <admin_token>
 */
router.patch(
    '/:id/activate',
    authorizeRoles('admin'),
    validate(driverValidation.activateDriver),
    asyncHandler(driverController.activateDriver)
);

/**
 * @route   DELETE /api/v1/drivers/:id
 * @desc    Delete a driver (admin only)
 * @access  Private (Admin only)
 * 
 * @param   {string} id - Driver ID
 * @body    {string} [reason] - Deletion reason
 * @body    {string} [permanent] - Permanent deletion flag
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/drivers/drv_123
 * Authorization: Bearer <admin_token>
 * Body: { "reason": "Account closed", "permanent": false }
 */
router.delete(
    '/:id',
    authorizeRoles('admin'),
    validate(driverValidation.deleteDriver),
    asyncHandler(driverController.deleteDriver)
);

// =============================================================================
// SECTION 15: HEALTH CHECK
// =============================================================================

/**
 * @route   GET /api/v1/drivers/health
 * @desc    Health check for driver routes
 * @access  Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/drivers/health
 * Response: { status: 'healthy', endpoint: '/api/v1/drivers', version: '3.0.0' }
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        endpoint: '/api/v1/drivers',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        services: {
            profileManagement: 'operational',
            rideManagement: 'operational',
            earningsManagement: 'operational',
            vehicleManagement: 'operational',
            documentManagement: 'operational',
            analytics: 'operational'
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requestId: req.requestId
    });
});

// =============================================================================
// SECTION 16: ERROR HANDLING
// =============================================================================

// Catch-all for undefined driver routes
router.use((req, res, next) => {
    const error = new AppError(
        `Cannot find ${req.method} ${req.originalUrl} in driver routes`,
        404,
        'ROUTE_NOT_FOUND'
    );
    next(error);
});

// Error handler for driver routes
router.use((err, req, res, next) => {
    logger.error('Driver routes error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        requestId: req.requestId
    });

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;