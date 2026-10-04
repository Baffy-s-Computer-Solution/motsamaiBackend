/**
 * Payment Routes
 * Version: 3.0.0
 * Description: Payment processing and management endpoints
 * 
 * @module routes/v1/paymentRoutes
 * @requires express
 * @requires controllers/paymentController
 * @requires controllers/mobileMoneyController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/payment.validation
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 */

const express = require('express');
const router = express.Router();

// Controllers
const paymentController = require('../../controllers/paymentController');
const mobileMoneyController = require('../../controllers/mobileMoneyController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const paymentValidation = require('../../middleware/payment.validation');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const { cacheMiddleware } = require('../../middleware/cache');

  // Vodacom calls this callback without a Motsamai user token.
router.post('/vodacom/callback', express.json(), paymentController.handleVodacomCallback);

/**
 * Apply authentication to all payment routes
 * Payment operations require authentication
 */
router.use(auth, requestLogger);

router.post('/vodacom/initiate', paymentController.initiateVodacomPayment);
router.get('/vodacom/status/:transactionId', paymentController.queryVodacomStatus);
router.post('/vodacom/refund/:transactionId', authorizeRoles('admin'), paymentController.refundVodacomPayment);
router.get('/vodacom/health', paymentController.vodacomHealth);

// =============================================================================
// PAYMENT CRUD OPERATIONS
// =============================================================================

/**
 * @route GET /api/v1/payments
 * @description Get user's payment history
 * @access Rider/Driver/Admin (role-based)
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by payment status
 * @queryParam {string} [type] - Payment type (ride/deposit/withdrawal)
 * @queryParam {string} [startDate] - Start date filter
 * @queryParam {string} [endDate] - End date filter
 * 
 * @returns {Object} Paginated payment history
 * 
 * @example
 * GET /api/v1/payments?page=1&status=completed&type=ride
 */
router.get(
  '/',
  validate(paymentValidation.getPaymentHistory),
  cacheMiddleware({ ttl: 30 }),
  paymentController.list
);

router.get(
  '/methods',
  cacheMiddleware({ ttl: 300 }),
  paymentController.getPaymentMethods
);

router.post(
  '/methods',
  validate(paymentValidation.addPaymentMethod),
  paymentController.addPaymentMethod
);

router.put(
  '/methods/:id',
  paymentController.updatePaymentMethod
);

router.put(
  '/methods/:id/default',
  paymentController.setDefaultPaymentMethod
);

router.delete(
  '/methods/:id',
  validate(paymentValidation.removePaymentMethod),
  paymentController.removePaymentMethod
);

router.get(
  '/transactions',
  paymentController.list
);

router.get(
  '/stats',
  paymentController.getPaymentStatistics
);

router.get('/mpesa', (req, res) => res.json({ success: true, provider: 'MPESA', enabled: Boolean(process.env.MPESA_API_URL) }));
router.get('/ecocash', (req, res) => res.json({ success: true, provider: 'ECOCASH', enabled: Boolean(process.env.ECOCASH_ENDPOINT) }));

/**
 * @route GET /api/v1/payments/:id
 * @description Get payment details by ID
 * @access Rider/Driver/Admin (role-based)
 * 
 * @param {string} id - Payment ID
 * @returns {Object} Payment details
 * 
 * @example
 * GET /api/v1/payments/pay_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  validate(paymentValidation.getPaymentById),
  paymentController.getPaymentById
);

/**
 * @route POST /api/v1/payments
 * @description Create a new payment
 * @access Rider only
 * @rateLimit 5 requests per minute per user
 * 
 * @body {string} rideId - Associated ride ID
 * @body {number} amount - Payment amount
 * @body {string} currency - Currency code (USD/EUR/etc)
 * @body {string} method - Payment method (card/wallet/cash)
 * @body {string} [description] - Payment description
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Created payment
 * 
 * @example
 * POST /api/v1/payments
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "rideId": "rid_123", "amount": 15.50, "method": "wallet" }
 */
router.post(
  '/',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many payment creation attempts, please slow down'
  }),
  validate(paymentValidation.createPayment),
  paymentController.create
);

/**
 * @route PUT /api/v1/payments/:id/status
 * @description Update payment status (admin only)
 * @access Admin only
 * 
 * @param {string} id - Payment ID
 * @body {string} status - New status (pending/completed/failed/refunded)
 * @body {string} [reason] - Reason for status change
 * 
 * @returns {Object} Updated payment
 * 
 * @example
 * PUT /api/v1/payments/pay_123/status
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "status": "completed" }
 */
router.put(
  '/:id/status',
  authorizeRoles('admin'),
  validate(paymentValidation.updatePaymentStatus),
  paymentController.updatePaymentStatus
);

/**
 * @route DELETE /api/v1/payments/:id
 * @description Delete a payment (admin only)
 * @access Admin only
 * 
 * @param {string} id - Payment ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/payments/pay_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/:id',
  authorizeRoles('admin'),
  validate(paymentValidation.deletePayment),
  paymentController.deletePayment
);

// =============================================================================
// MOBILE MONEY PAYMENTS
// =============================================================================

/**
 * @route POST /api/v1/payments/mobile-money/initiate
 * @description Initiate mobile money payment
 * @access Rider only
 * @rateLimit 3 requests per minute per user
 * 
 * @body {string} phoneNumber - Mobile money phone number
 * @body {number} amount - Payment amount
 * @body {string} provider - Payment provider (MPESA or ECOCASH)
 * @body {string} [rideId] - Associated ride ID
 * @body {string} [reference] - Custom reference
 * @body {string} [accountReference] - Account reference
 * @body {string} [description] - Payment description
 * @body {Object} [metadata] - Additional metadata
 * 
 * @returns {Object} Payment initiation response with transaction ID
 * 
 * @example
 * POST /api/v1/payments/mobile-money/initiate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: {
 *   "phoneNumber": "+254712345678",
 *   "amount": 15.50,
 *   "provider": "MPESA",
 *   "rideId": "rid_123"
 * }
 */
router.post(
  '/mobile-money/initiate',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many payment initiation attempts, please slow down'
  }),
  validate(paymentValidation.initiateMobilePayment),
  paymentController.initiateMobilePayment
);

router.post('/mpesa/stk-push', validate(paymentValidation.initiateMpesaPayment), mobileMoneyController.initiateMpesaPayment);
router.post('/ecocash/initiate', validate(paymentValidation.initiateEcoCashPayment), mobileMoneyController.initiateEcoCashPayment);

/**
 * @route POST /api/v1/payments/mobile-money/mpesa/initiate
 * @description Initiate M-Pesa payment
 * @access Rider only
 * @rateLimit 3 requests per minute per user
 * 
 * @body {string} phoneNumber - M-Pesa registered phone number
 * @body {number} amount - Payment amount
 * @body {string} [rideId] - Associated ride ID
 * @body {string} [description] - Payment description
 * 
 * @returns {Object} M-Pesa payment initiation response
 * 
 * @example
 * POST /api/v1/payments/mobile-money/mpesa/initiate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "phoneNumber": "+254712345678", "amount": 15.50, "rideId": "rid_123" }
 */
router.post(
  '/mobile-money/mpesa/initiate',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many M-Pesa initiation attempts, please slow down'
  }),
  validate(paymentValidation.initiateMpesaPayment),
  mobileMoneyController.initiateMpesaPayment
);

/**
 * @route POST /api/v1/payments/mobile-money/ecocash/initiate
 * @description Initiate EcoCash payment
 * @access Rider only
 * @rateLimit 3 requests per minute per user
 * 
 * @body {string} phoneNumber - EcoCash registered phone number
 * @body {number} amount - Payment amount
 * @body {string} [rideId] - Associated ride ID
 * @body {string} [description] - Payment description
 * 
 * @returns {Object} EcoCash payment initiation response
 * 
 * @example
 * POST /api/v1/payments/mobile-money/ecocash/initiate
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "phoneNumber": "+263712345678", "amount": 15.50, "rideId": "rid_123" }
 */
router.post(
  '/mobile-money/ecocash/initiate',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many EcoCash initiation attempts, please slow down'
  }),
  validate(paymentValidation.initiateEcoCashPayment),
  mobileMoneyController.initiateEcoCashPayment
);

/**
 * @route GET /api/v1/payments/mobile-money/status/:provider/:transactionId
 * @description Query mobile money payment status
 * @access Rider/Driver/Admin
 * 
 * @param {string} provider - Payment provider (MPESA or ECOCASH)
 * @param {string} transactionId - Transaction ID
 * 
 * @returns {Object} Payment status with transaction details
 * 
 * @example
 * GET /api/v1/payments/mobile-money/status/MPESA/TXN123456
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/mobile-money/status/:provider/:transactionId',
  validate(paymentValidation.queryPaymentStatus),
  mobileMoneyController.queryPaymentStatus
);

/**
 * @route GET /api/v1/payments/mobile-money/status
 * @description Query payment status with query parameters
 * @access Rider/Driver/Admin
 * 
 * @queryParam {string} provider - Payment provider (MPESA or ECOCASH)
 * @queryParam {string} transactionId - Transaction ID
 * @queryParam {string} [providerTransactionId] - Provider transaction ID
 * 
 * @returns {Object} Payment status
 * 
 * @example
 * GET /api/v1/payments/mobile-money/status?provider=MPESA&transactionId=TXN123456
 */
router.get(
  '/mobile-money/status',
  validate(paymentValidation.queryPaymentStatusQuery),
  mobileMoneyController.queryPaymentStatus
);

/**
 * @route GET /api/v1/payments/mobile-money/history
 * @description Get mobile money transaction history
 * @access Rider/Driver (role-based)
 * 
 * @queryParam {string} [provider] - Filter by provider
 * @queryParam {string} [status] - Filter by status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * 
 * @returns {Object} Paginated transaction history
 * 
 * @example
 * GET /api/v1/payments/mobile-money/history?provider=MPESA&status=completed
 */
router.get(
  '/mobile-money/history',
  validate(paymentValidation.getTransactionHistory),
  mobileMoneyController.getTransactionHistory
);

// =============================================================================
// PAYOUTS
// =============================================================================

/**
 * @route POST /api/v1/payments/mobile-money/mpesa/payout
 * @description Process M-Pesa payout (admin/finance only)
 * @access Admin, Finance roles
 * @rateLimit 2 requests per minute per user
 * 
 * @body {string} phoneNumber - Recipient phone number
 * @body {number} amount - Payout amount
 * @body {string} [commandId] - Command ID
 * @body {string} [remarks] - Payout remarks
 * @body {string} [occasion] - Occasion description
 * 
 * @returns {Object} Payout response
 * 
 * @example
 * POST /api/v1/payments/mobile-money/mpesa/payout
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "phoneNumber": "+254712345678", "amount": 100.00, "remarks": "Driver payout" }
 */
router.post(
  '/mobile-money/mpesa/payout',
  authorizeRoles('admin', 'finance'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    message: 'Too many payout attempts, please slow down'
  }),
  validate(paymentValidation.processPayout),
  mobileMoneyController.processMpesaPayout
);

// =============================================================================
// REVERSALS & REFUNDS
// =============================================================================

/**
 * @route POST /api/v1/payments/mobile-money/reverse
 * @description Reverse a transaction (admin/finance only)
 * @access Admin, Finance roles
 * @rateLimit 2 requests per minute per user
 * 
 * @body {string} transactionId - Transaction ID to reverse
 * @body {string} [reason] - Reversal reason
 * 
 * @returns {Object} Reversal response
 * 
 * @example
 * POST /api/v1/payments/mobile-money/reverse
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "transactionId": "TXN123456", "reason": "Duplicate transaction" }
 */
router.post(
  '/mobile-money/reverse',
  authorizeRoles('admin', 'finance'),
  rateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    message: 'Too many reversal attempts, please slow down'
  }),
  validate(paymentValidation.reverseTransaction),
  mobileMoneyController.reverseTransaction
);

/**
 * @route POST /api/v1/payments/refund
 * @description Process a refund
 * @access Admin, Finance roles
 * 
 * @body {string} paymentId - Payment ID to refund
 * @body {number} [amount] - Refund amount (partial refund)
 * @body {string} [reason] - Refund reason
 * 
 * @returns {Object} Refund response
 * 
 * @example
 * POST /api/v1/payments/refund
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "paymentId": "pay_123", "reason": "Customer requested refund" }
 */
router.post(
  '/refund',
  authorizeRoles('admin', 'finance'),
  validate(paymentValidation.processRefund),
  paymentController.processRefund
);

// =============================================================================
// WALLET MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/payments/wallet
 * @description Get user's wallet balance
 * @access Rider/Driver
 * @cache 30 seconds
 * 
 * @returns {Object} Wallet balance and details
 * 
 * @example
 * GET /api/v1/payments/wallet
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Response: { "success": true, "data": { "balance": 150.50, "currency": "USD" } }
 */
router.get(
  '/wallet',
  cacheMiddleware({ ttl: 30 }),
  paymentController.getWalletBalance
);

/**
 * @route POST /api/v1/payments/wallet/topup
 * @description Top up wallet balance
 * @access Rider only
 * @rateLimit 3 requests per minute per user
 * 
 * @body {number} amount - Amount to top up
 * @body {string} method - Payment method (card/mobileMoney)
 * @body {string} [reference] - Transaction reference
 * 
 * @returns {Object} Top-up confirmation
 * 
 * @example
 * POST /api/v1/payments/wallet/topup
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "amount": 50.00, "method": "card" }
 */
router.post(
  '/wallet/topup',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 3,
    message: 'Too many top-up attempts, please slow down'
  }),
  validate(paymentValidation.topUpWallet),
  paymentController.topUpWallet
);

/**
 * @route POST /api/v1/payments/wallet/withdraw
 * @description Withdraw from wallet
 * @access Rider/Driver
 * @rateLimit 2 requests per minute per user
 * 
 * @body {number} amount - Amount to withdraw
 * @body {string} method - Withdrawal method (bank/mobileMoney)
 * @body {string} destination - Destination account details
 * 
 * @returns {Object} Withdrawal confirmation
 * 
 * @example
 * POST /api/v1/payments/wallet/withdraw
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "amount": 20.00, "method": "mobileMoney", "destination": "+254712345678" }
 */
router.post(
  '/wallet/withdraw',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 2,
    message: 'Too many withdrawal attempts, please slow down'
  }),
  validate(paymentValidation.withdrawWallet),
  paymentController.withdrawWallet
);

// =============================================================================
// INVOICES & BILLING
// =============================================================================

/**
 * @route GET /api/v1/payments/invoices
 * @description Get user's invoices
 * @access Rider/Driver
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [status] - Filter by invoice status
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Paginated invoices
 * 
 * @example
 * GET /api/v1/payments/invoices?status=paid
 */
router.get(
  '/invoices',
  validate(paymentValidation.getInvoices),
  paymentController.getInvoices
);

/**
 * @route GET /api/v1/payments/invoices/:id
 * @description Get invoice details
 * @access Rider/Driver/Admin (role-based)
 * 
 * @param {string} id - Invoice ID
 * @returns {Object} Invoice details
 * 
 * @example
 * GET /api/v1/payments/invoices/inv_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/invoices/:id',
  validate(paymentValidation.getInvoiceById),
  paymentController.getInvoiceById
);

/**
 * @route GET /api/v1/payments/invoices/:id/download
 * @description Download invoice as PDF
 * @access Rider/Driver/Admin (role-based)
 * 
 * @param {string} id - Invoice ID
 * @returns {File} PDF invoice
 * 
 * @example
 * GET /api/v1/payments/invoices/inv_123/download
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/invoices/:id/download',
  validate(paymentValidation.getInvoiceById),
  paymentController.downloadInvoice
);

// =============================================================================
// PAYMENT METHODS
// =============================================================================

/**
 * @route GET /api/v1/payments/methods
 * @description Get user's payment methods
 * @access Rider/Driver
 * 
 * @returns {Object} List of payment methods
 * 
 * @example
 * GET /api/v1/payments/methods
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/methods',
  cacheMiddleware({ ttl: 300 }),
  paymentController.getPaymentMethods
);

/**
 * @route POST /api/v1/payments/methods
 * @description Add a new payment method
 * @access Rider only
 * 
 * @body {string} type - Payment method type (card/mobileMoney/bank)
 * @body {Object} details - Method details (varies by type)
 * @body {boolean} [default] - Set as default payment method
 * 
 * @returns {Object} Created payment method
 * 
 * @example
 * POST /api/v1/payments/methods
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "type": "card", "details": { "last4": "1234", "expiry": "12/25" }, "default": true }
 */
router.post(
  '/methods',
  validate(paymentValidation.addPaymentMethod),
  paymentController.addPaymentMethod
);

/**
 * @route DELETE /api/v1/payments/methods/:id
 * @description Remove a payment method
 * @access Rider only
 * 
 * @param {string} id - Payment method ID
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/payments/methods/pm_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.delete(
  '/methods/:id',
  validate(paymentValidation.removePaymentMethod),
  paymentController.removePaymentMethod
);

// =============================================================================
// WEBHOOKS (No Authentication - Called by Payment Providers)
// =============================================================================

/**
 * @route POST /api/v1/payments/webhook/mpesa
 * @description M-Pesa webhook endpoint
 * @access Public (called by Safaricom)
 * 
 * @body {Object} webhook - M-Pesa webhook payload
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/payments/webhook/mpesa
 * Body: { ...M-Pesa webhook payload... }
 */
router.post(
  '/webhook/mpesa',
  express.raw({ type: 'application/json' }),
  mobileMoneyController.mpesaWebhook
);

/**
 * @route POST /api/v1/payments/webhook/ecocash
 * @description EcoCash webhook endpoint
 * @access Public (called by EcoCash)
 * 
 * @body {Object} webhook - EcoCash webhook payload
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/payments/webhook/ecocash
 * Body: { ...EcoCash webhook payload... }
 */
router.post(
  '/webhook/ecocash',
  express.raw({ type: 'application/json' }),
  mobileMoneyController.ecocashWebhook
);

/**
 * @route POST /api/v1/payments/webhook/stripe
 * @description Stripe webhook endpoint
 * @access Public (called by Stripe)
 * 
 * @body {Object} webhook - Stripe webhook payload
 * 
 * @returns {Object} Webhook processing confirmation
 * 
 * @example
 * POST /api/v1/payments/webhook/stripe
 * Body: { ...Stripe webhook payload... }
 */
router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  paymentController.stripeWebhook
);

// =============================================================================
// STATISTICS & INSIGHTS
// =============================================================================

/**
 * @route GET /api/v1/payments/statistics
 * @description Get payment statistics
 * @access Admin, Finance roles
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * 
 * @returns {Object} Payment statistics
 * 
 * @example
 * GET /api/v1/payments/statistics?period=week
 */
router.get(
  '/statistics',
  authorizeRoles('admin', 'finance'),
  cacheMiddleware({ ttl: 300 }),
  validate(paymentValidation.getPaymentStatistics),
  paymentController.getPaymentStatistics
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/payments/health
 * @description Health check for payment routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/payments/health
 * Response: { status: 'healthy', endpoint: '/api/v1/payments', version: '3.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/payments',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    services: {
      paymentProcessing: 'operational',
      mobileMoney: 'operational',
      wallet: 'operational'
    }
  });
});

module.exports = router;
