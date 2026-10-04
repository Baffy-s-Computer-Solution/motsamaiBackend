/**
 * EcoCash Lesotho Configuration
 * Production-ready configuration with validation
 * @module config/ecocash
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

class EcoCashConfig {
  constructor() {
    this.requiredEnvVars = [
      'ECOCASH_MERCHANT_ID',
      'ECOCASH_API_KEY',
      'ECOCASH_API_SECRET',
      'ECOCASH_MERCHANT_NAME',
      'ECOCASH_ENVIRONMENT',
      'ECOCASH_CALLBACK_BASE_URL',
      'ECOCASH_SHORTCODE'
    ];
    this.missingEnvVars = this.getMissingEnvVars();
    this.isConfigured = this.missingEnvVars.length === 0;

    if (this.isConfigured) {
      this.validateEnvironment();
    } else {
      logger.warn(`EcoCash configuration disabled. Missing environment variables: ${this.missingEnvVars.join(', ')}`);
    }

    this.initializeConfig();
  }

  getMissingEnvVars() {
    return this.requiredEnvVars.filter(varName => !process.env[varName]);
  }

  validateEnvironment() {
    const validEnvs = ['sandbox', 'production'];
    if (!validEnvs.includes(process.env.ECOCASH_ENVIRONMENT)) {
      throw new Error(`ECOCASH_ENVIRONMENT must be one of: ${validEnvs.join(', ')}`);
    }
  }

  requireConfigured() {
    if (!this.isConfigured) {
      throw new Error(`EcoCash is not configured. Missing environment variables: ${this.missingEnvVars.join(', ')}`);
    }
  }

  initializeConfig() {
    this.merchantId = process.env.ECOCASH_MERCHANT_ID;
    this.apiKey = process.env.ECOCASH_API_KEY;
    this.apiSecret = process.env.ECOCASH_API_SECRET;
    this.merchantName = process.env.ECOCASH_MERCHANT_NAME;
    this.environment = process.env.ECOCASH_ENVIRONMENT;
    this.callbackBaseUrl = process.env.ECOCASH_CALLBACK_BASE_URL;
    this.shortcode = process.env.ECOCASH_SHORTCODE;
    
    // API Endpoints - Lesotho specific
    this.endpoints = {
      sandbox: {
        auth: 'https://sandbox.ecocash.co.ls/api/v1/oauth/token',
        initiatePayment: 'https://sandbox.ecocash.co.ls/api/v1/payment/initiate',
        queryPayment: 'https://sandbox.ecocash.co.ls/api/v1/payment/query',
        reversePayment: 'https://sandbox.ecocash.co.ls/api/v1/payment/reverse',
        transactionStatus: 'https://sandbox.ecocash.co.ls/api/v1/transaction/status',
        bulkPayment: 'https://sandbox.ecocash.co.ls/api/v1/payment/bulk'
      },
      production: {
        auth: 'https://api.ecocash.co.ls/api/v1/oauth/token',
        initiatePayment: 'https://api.ecocash.co.ls/api/v1/payment/initiate',
        queryPayment: 'https://api.ecocash.co.ls/api/v1/payment/query',
        reversePayment: 'https://api.ecocash.co.ls/api/v1/payment/reverse',
        transactionStatus: 'https://api.ecocash.co.ls/api/v1/transaction/status',
        bulkPayment: 'https://api.ecocash.co.ls/api/v1/payment/bulk'
      }
    };

    this.currentEndpoints = this.endpoints[this.environment];
    
    // Payment types
    this.paymentTypes = {
      CUSTOMER_PAY: 'CUSTOMER_PAY',
      MERCHANT_PAY: 'MERCHANT_PAY',
      BULK_PAY: 'BULK_PAY',
      REFUND: 'REFUND'
    };

    // Currencies
    this.currencies = {
      LSL: 'LSL',
      ZAR: 'ZAR'
    };

    // Languages
    this.languages = {
      EN: 'EN',
      ST: 'ST' // Sesotho
    };

    if (this.isConfigured) {
      logger.info(`EcoCash configuration initialized for ${this.environment} environment`);
    }
  }

  generateSignature(payload, timestamp) {
    const stringToSign = `${this.apiKey}${timestamp}${JSON.stringify(payload)}${this.apiSecret}`;
    return crypto.createHash('sha256').update(stringToSign).digest('hex');
  }

  generateTimestamp() {
    return new Date().toISOString().replace(/[-:.]/g, '');
  }

  getAuthHeader() {
    const credentials = `${this.merchantId}:${this.apiSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }
}

module.exports = new EcoCashConfig();
