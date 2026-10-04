const axios = require('axios');
const logger = require('../utils/logger');
const { BadRequestException } = require('../exceptions/api.exception');
const { Payment, Ride } = require('../models');
const socketService = require('./socketService');
const walletService = require('./walletService');
const mpesaConfig = require('../config/mpesa');

class MpesaService {
  constructor() {
    this.config = mpesaConfig;
    this.baseUrl = process.env.MPESA_API_URL || 'https://sandbox.safaricom.co.ke';
    this.consumerKey = this.config.consumerKey;
    this.consumerSecret = this.config.consumerSecret;
    this.shortCode = this.config.shortcode;
  }

  assertLesothoProvider() {
    const isKenyaDaraja = /safaricom\.co\.ke/i.test(this.baseUrl);
    if (this.config.country !== 'LS' || isKenyaDaraja) {
      throw new BadRequestException(
        'Lesotho M-Pesa is not configured. Safaricom Daraja Kenya endpoints cannot process Lesotho payments.'
      );
    }
  }

  async getAccessToken() {
    this.assertLesothoProvider();
    this.config.requireConfigured();
    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      const response = await axios.get(this.config.currentEndpoints.auth, {
        headers: { Authorization: `Basic ${auth}` }
      });
      return response.data.access_token;
    } catch (error) {
      logger.error('M-Pesa Auth Error', error.response?.data || error.message);
      throw new Error('Failed to authenticate with M-Pesa');
    }
  }

  async stkPush({ phoneNumber, amount, accountReference, transactionDesc, transactionId }) {
    const token = await this.getAccessToken();
    const timestamp = this.config.generateTimestamp();
    const normalizedPhone = String(phoneNumber).replace(/\D/g, '');
    const callbackBaseUrl = process.env.MPESA_CALLBACK_BASE_URL || process.env.API_BASE_URL;
    if (!this.shortCode || !this.config.passkey || !callbackBaseUrl) {
      throw new BadRequestException('M-Pesa sandbox requires shortcode, passkey, and a public callback URL');
    }
    
    const payload = {
      BusinessShortCode: this.shortCode,
      Password: Buffer.from(`${this.shortCode}${this.config.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: normalizedPhone,
      PartyB: this.shortCode,
      PhoneNumber: normalizedPhone,
      CallBackURL: `${callbackBaseUrl}/api/v1/webhooks/mpesa/result`,
      AccountReference: accountReference,
      TransactionDesc: transactionDesc,
      ExternalReference: transactionId
    };

    try {
      const response = await axios.post(this.config.currentEndpoints.stkPush, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      logger.error('M-Pesa STK Push Error', error.response?.data || error.message);
      throw new BadRequestException('M-Pesa payment initiation failed');
    }
  }

  async queryStkStatus(checkoutRequestId) {
    const token = await this.getAccessToken();
    const timestamp = this.config.generateTimestamp();
    const payload = {
      BusinessShortCode: this.shortCode,
      Password: Buffer.from(`${this.shortCode}${this.config.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    try {
      const response = await axios.post(this.config.currentEndpoints.stkQuery, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = response.data || {};
      return {
        ...result,
        checkoutRequestId,
        status: String(result.ResultCode) === '0' ? 'COMPLETED' : result.ResultCode ? 'FAILED' : 'PENDING'
      };
    } catch (error) {
      logger.error('M-Pesa STK Query Error', error.response?.data || error.message);
      throw new BadRequestException('M-Pesa status query failed');
    }
  }

  async handleWebhook(payload) {
    logger.info('M-Pesa Webhook Received', payload);
    
    const { Body } = payload;
    if (!Body || !Body.stkCallback) {
      logger.warn('Invalid M-Pesa webhook payload structure');
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;
    
    // Map M-Pesa ResultCode to internal status
    // ResultCode 0 represents success
    const status = ResultCode === 0 ? 'COMPLETED' : 'FAILED';

    const payment = await Payment.findOne({ 
      where: { transaction_id: CheckoutRequestID },
      include: [{ model: Ride, as: 'ride' }]
    });
    
    if (payment) {
      await payment.update({ status });

      if (status === 'COMPLETED') {
        await walletService.updateBalance(
          payment.user_id,
          payment.amount,
          'credit',
          `M-Pesa Payment Success: ${CheckoutRequestID}`,
          payment.id
        );
      }

      if (status === 'COMPLETED' && payment.ride) {
        await payment.ride.update({ status: 'confirmed' });
        
        // Notify the Rider via Socket
        socketService.io.to(`user:${payment.ride.rider_id}`).emit('payment:confirmed', {
          rideId: payment.ride.id,
          amount: payment.amount,
          method: 'M-Pesa'
        });
      }
      
      logger.info(`M-Pesa update: Payment ${payment.id} is ${status}`);
    } else {
      logger.warn(`No payment record found for M-Pesa CheckoutRequestID: ${CheckoutRequestID}`);
    }
  }

  /**
   * Process B2C (Business to Customer) payment
   */
  async b2cPayment({ phoneNumber, amount, commandId, remarks, occasion, transactionId }) {
    const token = await this.getAccessToken();
    
    const payload = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      CommandID: commandId || 'BusinessPayment',
      Amount: Math.round(amount),
      PartyA: process.env.MPESA_SHORTCODE,
      PartyB: phoneNumber.replace('+', ''),
      Remarks: remarks || 'Motsamai Payout',
      QueueTimeOutURL: `${process.env.API_BASE_URL}/v1/webhooks/mpesa/timeout`,
      ResultURL: `${process.env.API_BASE_URL}/v1/webhooks/mpesa/b2c-result`,
      Occasion: occasion || 'Payout',
      OriginatorConversationID: transactionId
    };
    
    try {
      const response = await axios.post(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      logger.error('M-Pesa B2C Error', error.response?.data || error.message);
      throw new Error('M-Pesa payout failed');
    }
  }

  /**
   * Reverse a transaction
   */
  async reverseTransaction({ transactionId, amount, receiverParty, remarks, occasion }) {
    const token = await this.getAccessToken();
    
    const payload = {
      CommandID: 'TransactionReversal',
      Amount: Math.round(amount),
      ReceiverParty: receiverParty,
      ReceiverIdentifierType: '1',
      Remarks: remarks || 'Transaction reversal',
      QueueTimeOutURL: `${process.env.API_BASE_URL}/v1/webhooks/mpesa/reversal-timeout`,
      ResultURL: `${process.env.API_BASE_URL}/v1/webhooks/mpesa/reversal-result`,
      Occasion: occasion || `Reverse of ${transactionId}`,
      OriginalTransactionID: transactionId,
      Initiator: process.env.MPESA_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL
    };
    
    try {
      const response = await axios.post(`${this.baseUrl}/mpesa/reversal/v1/request`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      logger.error('M-Pesa Reversal Error', error.response?.data || error.message);
      throw new Error('M-Pesa reversal failed');
    }
  }
}

module.exports = new MpesaService();