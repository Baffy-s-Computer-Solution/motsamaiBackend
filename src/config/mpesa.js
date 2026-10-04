/**
 * M-Pesa Lesotho Configuration
 * Production-ready configuration with validation and environment checks
 * @module config/mpesa
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const isConfiguredValue = value => Boolean(value && value.trim() && value !== 'UPDATE_ME');

class MpesaConfig {
  constructor() {
    this.requiredEnvVars = [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_PASSKEY',
      'MPESA_SHORTCODE',
      'MPESA_INITIATOR_NAME',
      'MPESA_INITIATOR_PASSWORD',
      'MPESA_ENVIRONMENT',
      'MPESA_CALLBACK_BASE_URL'
    ];
    this.missingEnvVars = this.getMissingEnvVars();
    this.isConfigured = this.missingEnvVars.length === 0;

    if (this.isConfigured) {
      this.validateEnvironment();
    } else {
      logger.warn(`M-Pesa configuration disabled. Missing environment variables: ${this.missingEnvVars.join(', ')}`);
    }

    this.initializeConfig();
  }

  getMissingEnvVars() {
    return this.requiredEnvVars.filter(varName => !isConfiguredValue(process.env[varName]));
  }

  validateEnvironment() {
    // Validate environment value
    const validEnvs = ['sandbox', 'production'];
    if (!validEnvs.includes(process.env.MPESA_ENVIRONMENT)) {
      throw new Error(`MPESA_ENVIRONMENT must be one of: ${validEnvs.join(', ')}`);
    }
  }

  requireConfigured() {
    if (!this.isConfigured) {
      throw new Error(`M-Pesa is not configured. Missing environment variables: ${this.missingEnvVars.join(', ')}`);
    }
  }

  initializeConfig() {
    this.country = process.env.MPESA_COUNTRY || 'LS';
    this.mode = process.env.MPESA_MODE || 'sandbox-simulator';
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.initiatorName = process.env.MPESA_INITIATOR_NAME;
    this.initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD;
    this.environment = process.env.MPESA_ENVIRONMENT;
    this.callbackBaseUrl = process.env.MPESA_CALLBACK_BASE_URL;
    this.timeoutUrl = `${this.callbackBaseUrl}/api/v1/webhooks/mpesa/timeout`;
    this.resultUrl = `${this.callbackBaseUrl}/api/v1/webhooks/mpesa/result`;
    
    // API Endpoints
    this.endpoints = {
      sandbox: {
        auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        stkPush: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        stkQuery: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        b2c: 'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        b2b: 'https://sandbox.safaricom.co.ke/mpesa/b2b/v1/paymentrequest',
        reversal: 'https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request',
        accountBalance: 'https://sandbox.safaricom.co.ke/mpesa/accountbalance/v1/query',
        transactionStatus: 'https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query'
      },
      production: {
        auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        stkPush: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        stkQuery: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        b2c: 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
        b2b: 'https://api.safaricom.co.ke/mpesa/b2b/v1/paymentrequest',
        reversal: 'https://api.safaricom.co.ke/mpesa/reversal/v1/request',
        accountBalance: 'https://api.safaricom.co.ke/mpesa/accountbalance/v1/query',
        transactionStatus: 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query'
      }
    };

    this.currentEndpoints = this.endpoints[this.environment];
    
    // Transaction types
    this.transactionTypes = {
      CUSTOMER_PAY_BILL_ONLINE: 'CustomerPayBillOnline',
      CUSTOMER_BUY_GOODS_ONLINE: 'CustomerBuyGoodsOnline',
      BUSINESS_PAY_CUSTOMER: 'BusinessPayCustomer',
      BUSINESS_PAY_BUSINESS: 'BusinessPayBusiness',
      SALARY_PAYMENT: 'SalaryPayment',
      PROMOTION_PAYMENT: 'PromotionPayment'
    };

    // Command IDs for B2C
    this.b2cCommandIds = {
      SALARY: 'SalaryPayment',
      BUSINESS: 'BusinessPayment',
      PROMOTION: 'PromotionPayment'
    };

    // Identifier types
    this.identifierTypes = {
      SHORTCODE: '1',
      MSISDN: '2',
      TILL_NUMBER: '3',
      PAYBILL: '4'
    };

    if (this.isConfigured) {
      logger.info(`M-Pesa configuration initialized for ${this.environment} environment`);
    }
  }

  generatePassword(shortcode, passkey, timestamp) {
    const data = `${shortcode}${passkey}${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  getAuthHeader() {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    return `Basic ${auth}`;
  }

  getStkPushPassword(timestamp) {
    return this.generatePassword(this.shortcode, this.passkey, timestamp);
  }
}

module.exports = new MpesaConfig();
