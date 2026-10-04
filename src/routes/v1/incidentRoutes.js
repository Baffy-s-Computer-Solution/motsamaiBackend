/**
 * Incident Routes
 * Version: 2.0.0
 * Description: Incident reporting and management endpoints
 * 
 * @module routes/v1/incidentRoutes
 * @requires express
 * @requires controllers/incidentController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/incident.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const incidentController = require('../../controllers/incidentController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const incidentValidation = require('../../middleware/incident.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const { upload } = require('../../utils/fileUpload');

/**
 * Apply authentication to all incident routes
 */
router.use(auth, requestLogger);

// =============================================================================
// INCIDENT REPORTING
// =============================================================================

/**
 * @route POST /api/v1/incidents
 * @description Report a new incident
 * @access Rider, Driver, Admin
 * @rateLimit 5 requests per minute per user
 * 
 * @body {string} type - Incident type (accident/dispute/theft/other)
 * @body {string} severity - Severity level (low/medium/high/critical)
 * @body {string} description - Incident description
 * @body {string} [rideId] - Associated ride ID
 * @body {Object} [location] - Incident location
 * @body {number} location.latitude - Latitude
 * @body {number} location.longitude - Longitude
 * @body {string} [location.address] - Address
 * @body {string[]} [participants] - Participant IDs
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created incident with tracking number
 * 
 * @example
 * POST /api/v1/incidents
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "type": "accident",
 *   "severity": "high",
 *   "description": "Rear-end collision at intersection",
 *   "rideId": "rid_123",
 *   "location": { "latitude": 34.05, "longitude": -118.25 }
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "incidentId": "inc_123",
 *     "trackingNumber": "INC-2024-001",
 *     "status": "reported"
 *   }
 * }
 */
router.post(
  '/',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many incident reports, please slow down'
  }),
  validate(incidentValidation.createIncident),
  incidentController.create
);

/**
 * @route POST /api/v1/incidents/:id/photos
 * @description Upload photos for an incident
 * @access Rider, Driver, Admin (participants only)
 * 
 * @param {string} id - Incident ID
 * @formData {File[]} photos - Incident photos (max 10)
 * @body {string} [caption] - Photo caption
 * 
 * @returns {Object} Uploaded photos URLs
 * 
 * @example
 * POST /api/v1/incidents/inc_123/photos
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Content-Type: multipart/form-data
 * formData: { "photos": [file1, file2] }
 */
router.post(
  '/:id/photos',
  upload.array('photos', 10),
  validate(incidentValidation.uploadIncidentPhotos),
  incidentController.uploadPhotos
);

// =============================================================================
// INCIDENT MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/incidents
 * @description Get user's incidents
 * @access Rider, Driver, Admin (role-based)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [type] - Filter by incident type
 * @queryParam {string} [severity] - Filter by severity
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated incident list
 * 
 * @example
 * GET /api/v1/incidents?page=1&status=open&severity=high
 */
router.get(
  '/',
  validate(incidentValidation.listIncidents),
  cacheMiddleware({ ttl: 30 }),
  incidentController.list
);

/**
 * @route GET /api/v1/incidents/:id
 * @description Get incident details
 * @access Rider, Driver, Admin (participants only)
 * @cache 30 seconds
 * 
 * @param {string} id - Incident ID
 * @returns {Object} Incident details with timeline
 * 
 * @example
 * GET /api/v1/incidents/inc_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  cacheMiddleware({ ttl: 30 }),
  validate(incidentValidation.getIncidentById),
  incidentController.getIncidentById
);

/**
 * @route PUT /api/v1/incidents/:id
 * @description Update incident details
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @body {string} [status] - Incident status
 * @body {string} [severity] - Updated severity
 * @body {string} [description] - Updated description
 * @body {string} [resolution] - Resolution notes
 * 
 * @returns {Object} Updated incident
 * 
 * @example
 * PUT /api/v1/incidents/inc_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "investigating", "severity": "medium" }
 */
router.put(
  '/:id',
  authorizeRoles('admin'),
  validate(incidentValidation.updateIncident),
  incidentController.update
);

/**
 * @route DELETE /api/v1/incidents/:id
 * @description Delete an incident (soft delete)
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/incidents/inc_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "False report" }
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(incidentValidation.deleteIncident),
  incidentController.delete
);

// =============================================================================
// INCIDENT STATUS UPDATES
// =============================================================================

/**
 * @route PUT /api/v1/incidents/:id/status
 * @description Update incident status
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @body {string} status - New status (investigating/resolved/closed)
 * @body {string} [notes] - Status update notes
 * 
 * @returns {Object} Updated status
 * 
 * @example
 * PUT /api/v1/incidents/inc_123/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "resolved", "notes": "Issue resolved with driver" }
 */
router.put(
  '/:id/status',
  authorizeRoles('admin'),
  validate(incidentValidation.updateIncidentStatus),
  incidentController.updateStatus
);

/**
 * @route POST /api/v1/incidents/:id/escalate
 * @description Escalate an incident
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @body {string} reason - Escalation reason
 * @body {string} [assignedTo] - Assign to specific team/individual
 * 
 * @returns {Object} Escalation confirmation
 * 
 * @example
 * POST /api/v1/incidents/inc_123/escalate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Requires legal team review", "assignedTo": "legal_team" }
 */
router.post(
  '/:id/escalate',
  authorizeRoles('admin'),
  validate(incidentValidation.escalateIncident),
  incidentController.escalate
);

// =============================================================================
// INCIDENT COMMENTS
// =============================================================================

/**
 * @route POST /api/v1/incidents/:id/comments
 * @description Add a comment to incident
 * @access Rider, Driver, Admin (participants only)
 * 
 * @param {string} id - Incident ID
 * @body {string} text - Comment text
 * @body {string} [visibility] - Comment visibility (public/private/internal)
 * 
 * @returns {Object} Added comment
 * 
 * @example
 * POST /api/v1/incidents/inc_123/comments
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "text": "Additional details: The driver was speeding", "visibility": "internal" }
 */
router.post(
  '/:id/comments',
  validate(incidentValidation.addComment),
  incidentController.addComment
);

/**
 * @route GET /api/v1/incidents/:id/comments
 * @description Get incident comments
 * @access Rider, Driver, Admin (participants only)
 * 
 * @param {string} id - Incident ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} Paginated comments
 * 
 * @example
 * GET /api/v1/incidents/inc_123/comments?page=1
 */
router.get(
  '/:id/comments',
  validate(incidentValidation.getComments),
  incidentController.getComments
);

// =============================================================================
// INCIDENT ASSIGNMENTS
// =============================================================================

/**
 * @route POST /api/v1/incidents/:id/assign
 * @description Assign incident to team/individual
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @body {string} assigneeId - Assignee ID
 * @body {string} [role] - Role in incident resolution
 * 
 * @returns {Object} Assignment confirmation
 * 
 * @example
 * POST /api/v1/incidents/inc_123/assign
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "assigneeId": "usr_456", "role": "investigator" }
 */
router.post(
  '/:id/assign',
  authorizeRoles('admin'),
  validate(incidentValidation.assignIncident),
  incidentController.assign
);

// =============================================================================
// INCIDENT ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/incidents/statistics
 * @description Get incident statistics
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Incident statistics
 * 
 * @example
 * GET /api/v1/incidents/statistics?period=month
 */
router.get(
  '/statistics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(incidentValidation.getIncidentStatistics),
  incidentController.getStatistics
);

/**
 * @route GET /api/v1/incidents/trends
 * @description Get incident trends
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Trend period
 * @queryParam {string} [type] - Filter by incident type
 * 
 * @returns {Object} Trend data
 * 
 * @example
 * GET /api/v1/incidents/trends?period=year&type=accident
 */
router.get(
  '/trends',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(incidentValidation.getIncidentTrends),
  incidentController.getTrends
);

// =============================================================================
// INCIDENT REPORTS
// =============================================================================

/**
 * @route GET /api/v1/incidents/:id/report
 * @description Generate incident report
 * @access Admin only
 * 
 * @param {string} id - Incident ID
 * @queryParam {string} [format=pdf] - Report format (pdf/html/json)
 * 
 * @returns {File} Generated report
 * 
 * @example
 * GET /api/v1/incidents/inc_123/report?format=pdf
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/report',
  authorizeRoles('admin'),
  validate(incidentValidation.generateReport),
  incidentController.generateReport
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/incidents/health
 * @description Health check for incident routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/incidents/health
 * Response: { status: 'healthy', endpoint: '/api/v1/incidents', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/incidents',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      incidentReporting: 'operational',
      incidentManagement: 'operational'
    }
  });
});

module.exports = router;