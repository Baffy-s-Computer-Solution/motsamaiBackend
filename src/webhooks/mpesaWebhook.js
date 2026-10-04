/**
 * M-Pesa Webhook Handler
 * Processes incoming callbacks from M-Pesa API
 * @module webhooks/mpesaWebhook
 */

const mpesaService = require('../services/mpesa.service');
const logger = require('../utils/logger');
const { PaymentWebhookLog } = require('../models');
const { ApiResponse } = require('../utils/apiResponse');

/**
 * Handle M-Pesa result callback
 */
async function handleMpesaResult(req, res) {
  const startTime = Date.now();
  
  try {
    const payload = req.body;
    
    logger.info('Received M-Pesa result callback', {
      resultCode: payload.ResultCode,
      resultDesc: payload.ResultDesc,
      checkoutRequestId: payload.CheckoutRequestID
    });
    
    // Process webhook asynchronously to respond quickly
    setImmediate(async () => {
      try {
        await mpesaService.processWebhook(payload, 'result');
      } catch (error) {
        logger.error('Error processing M-Pesa webhook async:', error);
      }
    });
    
    // Log webhook metrics
    await PaymentWebhookLog.create({
      provider: 'MPESA',
      webhookType: 'result',
      payload: payload,
      processingTime: Date.now() - startTime,
      receivedAt: new Date()
    });
    
    // Respond immediately to acknowledge receipt
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success'
    });
  } catch (error) {
    logger.error('Error in M-Pesa webhook handler:', error);
    
    res.status(500).json({
      ResultCode: 1,
      ResultDesc: 'Internal server error'
    });
  }
}

/**
 * Handle M-Pesa timeout callback
 */
async function handleMpesaTimeout(req, res) {
  try {
    const payload = req.body;
    
    logger.warn('Received M-Pesa timeout callback', {
      conversationId: payload.ConversationID,
      originatorConversationId: payload.OriginatorConversationID
    });
    
    await PaymentWebhookLog.create({
      provider: 'MPESA',
      webhookType: 'timeout',
      payload: payload,
      receivedAt: new Date()
    });
    
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Success'
    });
  } catch (error) {
    logger.error('Error in M-Pesa timeout handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Validate M-Pesa webhook requests
 */
function validateMpesaWebhook(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const allowedIps = process.env.MPESA_ALLOWED_IPS?.split(',') || [];
  
  // Skip IP validation in development
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  // Validate IP
  if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
    logger.warn(`Blocked M-Pesa webhook from unauthorized IP: ${ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

async function handleGeocodingWebhook(req, res) {
  return res.status(200).json({ received: true });
}

async function handleAnalyticsWebhook(req, res) {
  return res.status(200).json({ received: true });
}

async function getWebhookStatus(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      mpesa: { status: 'operational' },
      ecocash: { status: 'operational' },
      stripe: { status: 'operational' },
      sendgrid: { status: 'operational' },
    },
  });
}

async function getWebhookLogs(req, res) {
  return res.status(200).json({ success: true, data: { logs: [], total: 0 } });
}

module.exports = {
  handleMpesaResult,
  handleMpesaTimeout,
  validateMpesaWebhook,
  handleGeocodingWebhook,
  handleAnalyticsWebhook,
  getWebhookStatus,
  getWebhookLogs,
};
