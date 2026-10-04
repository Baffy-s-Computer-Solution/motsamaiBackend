const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');

// Public webhook endpoints for mobile money providers
router.post('/webhook/mpesa', paymentController.mpesaWebhook);
router.post('/webhook/ecocash', paymentController.ecocashWebhook);

router.use(auth);

// Initiate Mobile Money Payment (M-Pesa / EcoCash)
router.post('/initiate', paymentController.initiateMobilePayment);
router.get('/status', paymentController.checkStatus);

module.exports = router;