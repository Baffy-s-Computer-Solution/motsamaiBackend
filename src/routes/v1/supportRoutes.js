/**
 * Support Routes
 * Version: 2.0.0
 * Description: Customer support and ticket management endpoints
 * 
 * @module routes/v1/supportRoutes
 * @requires express
 * @requires controllers/supportController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/support.validation
 * @requires middleware/cache
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const supportController = require('../../controllers/supportController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const supportValidation = require('../../middleware/support.validation');
const { cacheMiddleware } = require('../../middleware/cache');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const { upload } = require('../../utils/fileUpload');

/**
 * Apply authentication to all support routes
 */
router.use(auth, requestLogger);

// =============================================================================
// SUPPORT TICKET MANAGEMENT
// =============================================================================

/**
 * @route POST /api/v1/support/tickets
 * @description Create a support ticket
 * @access All authenticated users
 * @rateLimit 3 requests per minute per user
 * 
 * @body {string} subject - Ticket subject
 * @body {string} description - Ticket description
 * @body {string} category - Category (ride/payment/technical/other)
 * @body {string} priority - Priority (low/medium/high/urgent)
 * @body {string} [rideId] - Associated ride ID
 * @body {string} [paymentId] - Associated payment ID
 * @body {string[]} [attachments] - Attachment URLs
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created ticket with tracking number
 * 
 * @example
 * POST /api/v1/support/tickets
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "subject": "Issue with payment",
 *   "description": "My payment was processed but the ride was cancelled",
 *   "category": "payment",
 *   "priority": "high",
 *   "rideId": "rid_123"
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "ticketId": "tkt_123",
 *     "trackingNumber": "TKT-2024-001",
 *     "status": "open",
 *     "createdAt": "2024-01-15T10:30:00Z"
 *   }
 * }
 */
router.post(
  '/tickets',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many ticket creation attempts, please slow down'
  }),
  validate(supportValidation.createTicket),
  supportController.createTicket
);

/**
 * @route GET /api/v1/support/tickets
 * @description Get user's support tickets
 * @access All authenticated users
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [category] - Filter by category
 * @queryParam {string} [priority] - Filter by priority
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated ticket list
 * 
 * @example
 * GET /api/v1/support/tickets?page=1&status=open&priority=high
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/tickets',
  cacheMiddleware({ ttl: 30 }),
  supportController.listTickets
);

/**
 * @route GET /api/v1/support/tickets/:id
 * @description Get ticket details
 * @access Ticket author, Support agent, Admin
 * @cache 30 seconds
 * 
 * @param {string} id - Ticket ID
 * @returns {Object} Ticket details with conversation history
 * 
 * @example
 * GET /api/v1/support/tickets/tkt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/tickets/:id',
  cacheMiddleware({ ttl: 30 }),
  validate(supportValidation.getTicketById),
  supportController.getTicketById
);

/**
 * @route PUT /api/v1/support/tickets/:id
 * @description Update ticket details (author only)
 * @access Ticket author only
 * 
 * @param {string} id - Ticket ID
 * @body {string} [subject] - Updated subject
 * @body {string} [description] - Updated description
 * @body {string} [category] - Updated category
 * @body {string} [priority] - Updated priority
 * 
 * @returns {Object} Updated ticket
 * 
 * @example
 * PUT /api/v1/support/tickets/tkt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "priority": "urgent", "description": "Updated description" }
 */
router.put(
  '/tickets/:id',
  validate(supportValidation.updateTicket),
  supportController.updateTicket
);

/**
 * @route DELETE /api/v1/support/tickets/:id
 * @description Delete a ticket (admin only)
 * @access Admin only
 * 
 * @param {string} id - Ticket ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/support/tickets/tkt_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Duplicate ticket" }
 */
router.delete(
  '/tickets/:id',
  authorizeRoles('admin'),
  validate(supportValidation.deleteTicket),
  supportController.deleteTicket
);

// =============================================================================
// TICKET STATUS UPDATES
// =============================================================================

/**
 * @route PATCH /api/v1/support/tickets/:id/status
 * @description Update ticket status
 * @access Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @body {string} status - New status (open/in-progress/resolved/closed)
 * @body {string} [notes] - Status update notes
 * 
 * @returns {Object} Updated status
 * 
 * @example
 * PATCH /api/v1/support/tickets/tkt_123/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "in-progress", "notes": "Assigned to support team" }
 */
router.patch(
  '/tickets/:id/status',
  authorizeRoles('admin', 'support'),
  validate(supportValidation.updateTicketStatus),
  supportController.updateTicketStatus
);

/**
 * @route PATCH /api/v1/support/tickets/:id/assign
 * @description Assign ticket to support agent
 * @access Admin only
 * 
 * @param {string} id - Ticket ID
 * @body {string} assigneeId - Support agent ID
 * 
 * @returns {Object} Assignment confirmation
 * 
 * @example
 * PATCH /api/v1/support/tickets/tkt_123/assign
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "assigneeId": "usr_456" }
 */
router.patch(
  '/tickets/:id/assign',
  authorizeRoles('admin'),
  validate(supportValidation.assignTicket),
  supportController.assignTicket
);

/**
 * @route PATCH /api/v1/support/tickets/:id/escalate
 * @description Escalate a ticket
 * @access Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @body {string} reason - Escalation reason
 * @body {string} [escalateTo] - Escalate to specific team
 * 
 * @returns {Object} Escalation confirmation
 * 
 * @example
 * PATCH /api/v1/support/tickets/tkt_123/escalate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "Requires technical review", "escalateTo": "technical_support" }
 */
router.patch(
  '/tickets/:id/escalate',
  authorizeRoles('admin', 'support'),
  validate(supportValidation.escalateTicket),
  supportController.escalateTicket
);

// =============================================================================
// TICKET MESSAGES
// =============================================================================

/**
 * @route POST /api/v1/support/tickets/:id/messages
 * @description Add a message to ticket
 * @access Ticket author, Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @body {string} message - Message text
 * @body {string} [type] - Message type (public/private/internal)
 * @body {string[]} [attachments] - Attachment URLs
 * 
 * @returns {Object} Added message
 * 
 * @example
 * POST /api/v1/support/tickets/tkt_123/messages
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "message": "Here are the screenshots of the issue", "type": "public" }
 */
router.post(
  '/tickets/:id/messages',
  validate(supportValidation.addMessage),
  supportController.addMessage
);

/**
 * @route GET /api/v1/support/tickets/:id/messages
 * @description Get ticket messages
 * @access Ticket author, Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} Paginated messages
 * 
 * @example
 * GET /api/v1/support/tickets/tkt_123/messages?page=1
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/tickets/:id/messages',
  validate(supportValidation.getMessages),
  supportController.getMessages
);

/**
 * @route PUT /api/v1/support/tickets/:id/messages/:messageId
 * @description Update a message (author only)
 * @access Message author only
 * 
 * @param {string} id - Ticket ID
 * @param {string} messageId - Message ID
 * @body {string} message - Updated message text
 * 
 * @returns {Object} Updated message
 * 
 * @example
 * PUT /api/v1/support/tickets/tkt_123/messages/msg_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "message": "Updated message text" }
 */
router.put(
  '/tickets/:id/messages/:messageId',
  validate(supportValidation.updateMessage),
  supportController.updateMessage
);

// =============================================================================
// TICKET ATTACHMENTS
// =============================================================================

/**
 * @route POST /api/v1/support/tickets/:id/attachments
 * @description Upload attachment to ticket
 * @access Ticket author, Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @formData {File} file - File to upload
 * @body {string} [description] - File description
 * 
 * @returns {Object} Uploaded attachment
 * 
 * @example
 * POST /api/v1/support/tickets/tkt_123/attachments
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Content-Type: multipart/form-data
 * formData: { "file": [file], "description": "Screenshot of error" }
 */
router.post(
  '/tickets/:id/attachments',
  upload.single('file'),
  validate(supportValidation.uploadAttachment),
  supportController.uploadAttachment
);

/**
 * @route DELETE /api/v1/support/tickets/:id/attachments/:attachmentId
 * @description Delete attachment
 * @access Ticket author, Support agent, Admin
 * 
 * @param {string} id - Ticket ID
 * @param {string} attachmentId - Attachment ID
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/support/tickets/tkt_123/attachments/att_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/tickets/:id/attachments/:attachmentId',
  validate(supportValidation.deleteAttachment),
  supportController.deleteAttachment
);

// =============================================================================
// SUPPORT ANALYTICS
// =============================================================================

/**
 * @route GET /api/v1/support/statistics
 * @description Get support statistics (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Support statistics
 * 
 * @example
 * GET /api/v1/support/statistics?period=month
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/statistics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(supportValidation.getSupportStatistics),
  supportController.getStatistics
);

/**
 * @route GET /api/v1/support/analytics/performance
 * @description Get support team performance (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Performance period
 * @queryParam {string} [teamId] - Filter by team
 * 
 * @returns {Object} Performance metrics
 * 
 * @example
 * GET /api/v1/support/analytics/performance?period=week
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/analytics/performance',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(supportValidation.getPerformanceMetrics),
  supportController.getPerformanceMetrics
);

// =============================================================================
// KNOWLEDGE BASE
// =============================================================================

/**
 * @route GET /api/v1/support/faq
 * @description Get FAQ articles
 * @access Public
 * @cache 1 hour
 * 
 * @queryParam {string} [category] - Filter by category
 * @queryParam {string} [search] - Search in FAQ
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} Paginated FAQ articles
 * 
 * @example
 * GET /api/v1/support/faq?category=payment&search=refund
 */
router.get(
  '/faq',
  cacheMiddleware({ ttl: 3600 }),
  validate(supportValidation.getFaq),
  supportController.getFaq
);

/**
 * @route GET /api/v1/support/faq/:id
 * @description Get FAQ article details
 * @access Public
 * @cache 1 hour
 * 
 * @param {string} id - FAQ ID
 * @returns {Object} FAQ article
 * 
 * @example
 * GET /api/v1/support/faq/faq_123
 */
router.get(
  '/faq/:id',
  cacheMiddleware({ ttl: 3600 }),
  validate(supportValidation.getFaqById),
  supportController.getFaqById
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/support/health
 * @description Health check for support routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/support/health
 * Response: { status: 'healthy', endpoint: '/api/v1/support', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/support',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      ticketManagement: 'operational',
      supportAnalytics: 'operational'
    }
  });
});

module.exports = router;
