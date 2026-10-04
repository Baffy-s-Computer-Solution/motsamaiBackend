/**
 * Sandbox Routes
 * Routes for sandbox simulation endpoints
 * @module sandbox/routes/sandboxRoutes
 */

const express = require('express');
const router = express.Router();
const sandboxController = require('../controllers/sandboxController');
const { authorizeRoles } = require('../../middleware/rbac');

// Middleware to ensure sandbox is only accessible in development/sandbox mode
const sandboxOnly = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_SANDBOX) {
    return res.status(403).json({ error: 'Sandbox mode is disabled in production' });
  }
  next();
};

// Sandbox status and configuration
router.get('/status', sandboxOnly, sandboxController.getStatus);
router.post('/configure', sandboxOnly, authorizeRoles(['admin', 'developer']), sandboxController.configureSimulation);
router.post('/reset', sandboxOnly, authorizeRoles(['admin', 'developer']), sandboxController.resetSimulation);

// Test data generation
router.post('/generate-data', sandboxOnly, sandboxController.generateTestData);
router.get('/test-accounts', sandboxOnly, sandboxController.getTestAccounts);

// Scenario testing
router.post('/run-scenario', sandboxOnly, sandboxController.runScenario);
router.post('/simulate-webhook', sandboxOnly, sandboxController.simulateWebhook);

// Transaction management
router.get('/transactions/:provider/:transactionId', sandboxOnly, sandboxController.getTransaction);
router.get('/transactions', sandboxOnly, sandboxController.listTransactions);

// Quick test endpoints for manual testing
router.post('/test/mpesa-payment', sandboxOnly, async (req, res) => {
  const mpesaSimulator = require('../simulators/mpesaSimulator');
  const result = await mpesaSimulator.stkPush({
    BusinessShortCode: '174379',
    Amount: req.body.amount || 100,
    PartyA: req.body.phone || '26650000001',
    PhoneNumber: req.body.phone || '26650000001',
    AccountReference: req.body.reference || 'TEST001',
    TransactionDesc: req.body.description || 'Test Payment'
  });
  res.json(result);
});

router.post('/test/ecocash-payment', sandboxOnly, async (req, res) => {
  const ecocashSimulator = require('../simulators/ecocashSimulator');
  const result = await ecocashSimulator.initiatePayment({
    merchantId: 'EASYGO001',
    amount: (req.body.amount || 100) * 100,
    customerMsisdn: req.body.phone || '26650000001',
    transactionReference: req.body.reference || 'TEST001',
    transactionDescription: req.body.description || 'Test Payment',
    callbackUrl: req.body.callbackUrl
  });
  res.json(result);
});

router.post('/test/ecocash-complete/:transactionId', sandboxOnly, async (req, res) => {
  const ecocashSimulator = require('../simulators/ecocashSimulator');
  const result = await ecocashSimulator.completePayment(
    req.params.transactionId,
    req.body.pin || '1234'
  );
  res.json(result);
});

module.exports = router;