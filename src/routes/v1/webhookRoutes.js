/**
 * Webhook Routes
 * Version: 2.0.0
 * Description: Incoming webhook endpoints for external services
 * 
 * @module routes/v1/webhookRoutes
 * @requires express
 * @requires webhooks/mpesaWebhook
 * @requires webhooks/ecocashWebhook
 * @requires webhooks/stripeWebhook
 * @requires webhooks/sendgridWebhook
 * @requires middleware/webhook.validation
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Webhooks
const mpesaWebhook = require('../../webhooks/mpesaWebhook');
const ecocashWebhook = require('../../webhooks/ecocashWebhook');
const stripeWebhook = require('../../webhooks/stripeWebhook');
const sendgridWebhook = require('../../webhooks/sendgridWebhook');

// Middleware
const { validateWebhook } = require('../../middleware/webhook.validation');
const { webhookRateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const authorizeRoles = require('../../middleware/authorizeRoles');

/**
 * Apply rate limiting to all webhook endpoints
 * Webhooks have different limits to accommodate external services
 */
router.use(webhookRateLimiter, requestLogger);

// =============================================================================
// PAYMENT PROVIDER WEBHOOKS
// =============================================================================

/**
 * @route POST /api/v1/webhooks/mpesa/result
 * @description M-Pesa result webhook
 * @access Public (called by Safaricom)
 * @rateLimit 100 requests per minute
 * 
 * @body {Object} Body - M-Pesa result payload
 * @body {Object} Body.Result - Result details
 * @body {string} Body.Result.ResultCode - Result code (0=success)
 * @body {string} Body.Result.ResultDesc - Result description
 * @body {Object} Body.Result.ResultParameters - Result parameters
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/mpesa/result
 * Body: { "Result": { "ResultCode": "0", "ResultDesc": "Success", ... } }
 * Response: { "success": true, "message": "Webhook processed successfully" }
 */
router.post(
  '/mpesa/result',
  express.raw({ type: 'application/json' }),
  validateWebhook('mpesa'),
  mpesaWebhook.validateMpesaWebhook,
  mpesaWebhook.handleMpesaResult
);

/**
 * @route POST /api/v1/webhooks/mpesa/timeout
 * @description M-Pesa timeout webhook
 * @access Public (called by Safaricom)
 * @rateLimit 100 requests per minute
 * 
 * @body {Object} Body - M-Pesa timeout payload
 * @body {Object} Body.Result - Result details
 * @body {string} Body.Result.ResultCode - Timeout code
 * @body {string} Body.Result.ResultDesc - Timeout description
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/mpesa/timeout
 * Body: { "Result": { "ResultCode": "1001", "ResultDesc": "Request timed out" } }
 */
router.post(
  '/mpesa/timeout',
  express.raw({ type: 'application/json' }),
  validateWebhook('mpesa'),
  mpesaWebhook.validateMpesaWebhook,
  mpesaWebhook.handleMpesaTimeout
);

/**
 * @route POST /api/v1/webhooks/ecocash
 * @description EcoCash webhook endpoint
 * @access Public (called by EcoCash)
 * @rateLimit 100 requests per minute
 * 
 * @body {Object} Body - EcoCash payload
 * @body {string} Body.transactionId - Transaction ID
 * @body {string} Body.status - Transaction status
 * @body {number} Body.amount - Transaction amount
 * @body {string} Body.phoneNumber - Customer phone number
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/ecocash
 * Body: { "transactionId": "TXN123", "status": "completed", "amount": 10.00 }
 */
router.post(
  '/ecocash',
  express.raw({ type: 'application/json' }),
  validateWebhook('ecocash'),
  ecocashWebhook.validateEcoCashWebhook,
  ecocashWebhook.handleEcoCashWebhook
);

/**
 * @route POST /api/v1/webhooks/stripe
 * @description Stripe webhook endpoint
 * @access Public (called by Stripe)
 * @rateLimit 100 requests per minute
 * 
 * @header {string} stripe-signature - Stripe signature header
 * @body {Object} Body - Stripe webhook payload
 * @body {string} Body.id - Event ID
 * @body {string} Body.type - Event type
 * @body {Object} Body.data - Event data
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/stripe
 * headers: { "stripe-signature": "t=1234567890,v1=..." }
 * Body: { "id": "evt_123", "type": "payment_intent.succeeded", "data": { ... } }
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  validateWebhook('stripe'),
  stripeWebhook.handleStripeWebhook
);

// =============================================================================
// NOTIFICATION PROVIDER WEBHOOKS
// =============================================================================

/**
 * @route POST /api/v1/webhooks/sendgrid
 * @description SendGrid webhook endpoint
 * @access Public (called by SendGrid)
 * @rateLimit 200 requests per minute
 * 
 * @body {Object[]} Body - SendGrid webhook payload (array of events)
 * @body {string} Body[].email - Recipient email
 * @body {string} Body[].event - Event type (delivered/opened/clicked/bounced)
 * @body {string} Body[].timestamp - Event timestamp
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/sendgrid
 * Body: [{ "email": "user@example.com", "event": "opened", "timestamp": 1234567890 }]
 */
router.post(
  '/sendgrid',
  express.raw({ type: 'application/json' }),
  validateWebhook('sendgrid'),
  sendgridWebhook.handleSendGridWebhook
);

/**
 * @route POST /api/v1/webhooks/twilio
 * @description Twilio webhook endpoint
 * @access Public (called by Twilio)
 * @rateLimit 200 requests per minute
 * 
 * @body {Object} Body - Twilio webhook payload
 * @body {string} Body.SmsStatus - SMS status
 * @body {string} Body.MessageSid - Message SID
 * @body {string} Body.To - Recipient number
 * @body {string} Body.From - Sender number
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/twilio
 * Body: { "SmsStatus": "delivered", "MessageSid": "SM123", "To": "+1234567890" }
 */
router.post(
  '/twilio',
  express.urlencoded({ extended: true }),
  validateWebhook('twilio'),
  sendgridWebhook.handleTwilioWebhook
);

// =============================================================================
// EXTERNAL SERVICE WEBHOOKS
// =============================================================================

/**
 * @route POST /api/v1/webhooks/geocoding
 * @description Geocoding service webhook
 * @access Public (called by geocoding service)
 * @rateLimit 50 requests per minute
 * 
 * @body {Object} Body - Geocoding result payload
 * @body {string} Body.requestId - Request ID
 * @body {Object} Body.result - Geocoding result
 * @body {number} Body.result.latitude - Latitude
 * @body {number} Body.result.longitude - Longitude
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/geocoding
 * Body: { "requestId": "req_123", "result": { "latitude": 34.05, "longitude": -118.25 } }
 */
router.post(
  '/geocoding',
  express.raw({ type: 'application/json' }),
  validateWebhook('geocoding'),
  mpesaWebhook.handleGeocodingWebhook
);

/**
 * @route POST /api/v1/webhooks/analytics
 * @description Analytics service webhook
 * @access Public (called by analytics service)
 * @rateLimit 50 requests per minute
 * 
 * @body {Object} Body - Analytics payload
 * @body {string} Body.timestamp - Event timestamp
 * @body {string} Body.eventType - Event type
 * @body {Object} Body.data - Event data
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/webhooks/analytics
 * Body: { "timestamp": "2024-01-15T10:30:00Z", "eventType": "ride_completed", "data": { ... } }
 */
router.post(
  '/analytics',
  express.raw({ type: 'application/json' }),
  validateWebhook('analytics'),
  mpesaWebhook.handleAnalyticsWebhook
);

// =============================================================================
// WEBHOOK STATUS & MONITORING
// =============================================================================

/**
 * @route GET /api/v1/webhooks/status
 * @description Get webhook service status
 * @access Admin only
 * 
 * @returns {Object} Webhook service statuses
 * 
 * @example
 * GET /api/v1/webhooks/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: {
 *   "success": true,
 *   "data": {
 *     "mpesa": { "status": "operational", "lastReceived": "2024-01-15T10:30:00Z" },
 *     "ecocash": { "status": "operational", "lastReceived": "2024-01-15T10:25:00Z" }
 *   }
 * }
 */
router.get(
  '/status',
  authorizeRoles('admin'),
  mpesaWebhook.getWebhookStatus
);

/**
 * @route GET /api/v1/webhooks/logs
 * @description Get webhook processing logs
 * @access Admin only
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [provider] - Filter by provider
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated webhook logs
 * 
 * @example
 * GET /api/v1/webhooks/logs?page=1&provider=mpesa
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/logs',
  authorizeRoles('admin'),
  validateWebhook('getLogs'),
  mpesaWebhook.getWebhookLogs
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/webhooks/health
 * @description Health check for webhook routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/webhooks/health
 * Response: { status: 'healthy', endpoint: '/api/v1/webhooks', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/webhooks',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      paymentWebhooks: 'operational',
      notificationWebhooks: 'operational'
    }
  });
});

module.exports = router;
