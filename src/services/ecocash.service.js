const axios = require('axios');
const logger = require('../utils/logger');
const { Payment, Ride } = require('../models');
const socketService = require('./socketService');

class EcoCashService {
  constructor() {
    this.merchantCode = process.env.ECOCASH_MERCHANT_CODE;
    this.apiKey = process.env.ECOCASH_API_KEY;
    this.endpoint = process.env.ECOCASH_ENDPOINT;
  }

  async initiatePayment({ phoneNumber, amount, reference, transactionId }) {
    const payload = {
      merchantCode: this.merchantCode,
      customerMobile: phoneNumber.replace('+', ''),
      amount: amount.toString(),
      reference,
      transactionId,
      callbackUrl: `${process.env.API_BASE_URL}/v1/webhooks/ecocash`
    };

    try {
      // Note: EcoCash Lesotho typically uses a REST/JSON or SOAP API
      const response = await axios.post(`${this.endpoint}/payment/initiate`, payload, {
        headers: { 
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      return {
        providerStatus: response.data.status,
        merchantReference: transactionId,
        instructions: "Please enter your PIN on your mobile device."
      };
    } catch (error) {
      logger.error('EcoCash Initiation Error', error.response?.data || error.message);
      throw new Error('EcoCash payment initiation failed');
    }
  }

  async queryPayment(transactionId) {
    // Logic to poll EcoCash status API
    return {
      status: 'PROCESSING',
      transactionId
    };
  }

  async handleWebhook(payload) {
    logger.info('EcoCash Webhook Received', payload);
    
    // payload structure varies by provider configuration, usually contains transaction ref and status
    const { transactionId, status } = payload;
    
    const internalStatus = status === 'SUCCESS' ? 'COMPLETED' : 'FAILED';

    const payment = await Payment.findOne({ 
      where: { transaction_id: transactionId },
      include: [{ model: Ride, as: 'ride' }]
    });
    
    if (payment) {
      await payment.update({ status: internalStatus });

      if (internalStatus === 'COMPLETED' && payment.ride) {
        await payment.ride.update({ status: 'confirmed' });
        
        socketService.io.to(`user:${payment.ride.rider_id}`).emit('payment:confirmed', {
          rideId: payment.ride.id,
          method: 'EcoCash'
        });
      }
      logger.info(`EcoCash update: Payment ${payment.id} is ${internalStatus}`);
    } else {
      logger.warn(`No payment record found for EcoCash transactionId: ${transactionId}`);
    }
  }
}

module.exports = new EcoCashService();