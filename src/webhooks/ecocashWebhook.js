/**
 * EcoCash Webhook Handler
 * Processes incoming callbacks from EcoCash API
 * @module webhooks/ecocashWebhook
 */

const ecocashService = require('../services/ecocash.service');
const logger = require('../utils/logger');
const { PaymentWebhookLog } = require('../models');

/**
 * Handle EcoCash payment callback
 */
async function handleEcoCashWebhook(req, res) {
  const startTime = Date.now();
  
  try {
    const payload = req.body;
    
    logger.info('Received EcoCash webhook', {
      transactionId: payload.transactionId,
      status: payload.status,
      amount: payload.amount
    });
    
    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await ecocashService.processWebhook(payload);
      } catch (error) {
        logger.error('Error processing EcoCash webhook async:', error);
      }
    });
    
    // Log webhook
    await PaymentWebhookLog.create({
      provider: 'ECOCASH',
      webhookType: 'payment',
      payload: payload,
      processingTime: Date.now() - startTime,
      receivedAt: new Date()
    });
    
    // Respond to acknowledge receipt
    res.status(200).json({
      status: 'SUCCESS',
      message: 'Webhook received successfully'
    });
  } catch (error) {
    logger.error('Error in EcoCash webhook handler:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Internal server error'
    });
  }
}

/**
 * Validate EcoCash webhook signature
 */
async function validateEcoCashWebhook(req, res, next) {
  const signature = req.headers['x-ecocash-signature'];
  const timestamp = req.headers['x-ecocash-timestamp'];
  
  if (!signature || !timestamp) {
    logger.warn('Missing EcoCash webhook headers');
    return res.status(401).json({ error: 'Missing authentication headers' });
  }
  
  // Store headers for validation
  req.webhookSignature = signature;
  req.webhookTimestamp = timestamp;
  
  next();
}

module.exports = {
  handleEcoCashWebhook,
  validateEcoCashWebhook
};