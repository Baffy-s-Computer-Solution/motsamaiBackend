const axios = require('axios');
const config = require('../config/vodacom');
const logger = require('../utils/logger');

class VodacomLesothoService {
  constructor() {
    this.config = config;
    this.sessionKey = null;
    this.sessionExpiresAt = 0;
  }

  formatPhone(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    const local = digits.startsWith('266') ? digits.slice(3) : digits.replace(/^0/, '');
    if (!/^[568]\d{7}$/.test(local)) {
      throw new Error('Invalid Lesotho phone number. Use 05XXXXXXXX, 06XXXXXXXX, or 266XXXXXXXX.');
    }
    return `266${local}`;
  }

  validateAmount(amount) {
    const value = Number(amount);
    const minimum = Number(process.env.MIN_PAYMENT_AMOUNT || 0.01);
    const maximum = Number(process.env.MAX_PAYMENT_AMOUNT || 1000000);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`Amount must be between ${minimum} and ${maximum} LSL.`);
    }
    return Math.round(value * 100) / 100;
  }

  async request(method, path, data, sessionKey) {
    return axios({
      method,
      url: `${config.baseURL}${path}`,
      data,
      timeout: config.timeout,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        ...(sessionKey ? { Authorization: `Bearer ${sessionKey}` } : {})
      }
    });
  }

  async generateSession() {
    config.requireConfigured();
    try {
      const response = await this.request('post', config.endpoints.generateSession, {
        apiKey: config.apiKey,
        sessionLifetime: config.sessionLifetime
      });
      const sessionKey = response.data?.sessionKey || response.data?.sessionId || response.data?.token;
      if (!sessionKey) throw new Error('Vodacom did not return a session key.');
      this.sessionKey = sessionKey;
      this.sessionExpiresAt = Date.now() + Math.max(60, config.sessionLifetime - 60) * 1000;
      logger.info('Vodacom Lesotho M-Pesa session generated');
      return sessionKey;
    } catch (error) {
      logger.error('Vodacom session generation failed', { status: error.response?.status, message: error.response?.data?.message || error.message });
      throw new Error(error.response?.data?.message || 'Failed to generate Vodacom Lesotho session.');
    }
  }

  async getSession() {
    return this.sessionKey && this.sessionExpiresAt > Date.now()
      ? this.sessionKey
      : this.generateSession();
  }

  async withRetry(operation) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (error.response?.status && error.response.status < 500 && error.response.status !== 429) break;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }
    throw lastError;
  }

  async initiatePayment({ phoneNumber, amount, reference, description = 'Motsamai ride payment', rideId }) {
    config.requirePaymentConfigured();
    const session = await this.getSession();
    const payload = {
      shortCode: config.shortCode,
      amount: this.validateAmount(amount),
      currency: config.currency,
      phoneNumber: this.formatPhone(phoneNumber),
      reference: String(reference || `MOT-${Date.now()}`).slice(0, 20),
      description: String(description).slice(0, 100),
      transactionType: 'C2B_MULTISTAGE',
      callbackUrl: config.callbackURL,
      ...(rideId ? { metadata: { rideId } } : {})
    };
    const response = await this.withRetry(() => this.request('post', config.endpoints.initiatePayment, payload, session));
    const data = response.data || {};
    return {
      transactionId: data.transactionId || data.transactionReference || data.id,
      status: String(data.status || 'pending').toLowerCase(),
      amount: payload.amount,
      currency: payload.currency,
      phoneNumber: payload.phoneNumber,
      reference: payload.reference,
      message: data.message || 'Payment initiated successfully',
      rawResponse: data
    };
  }

  async queryTransaction(transactionId) {
    const session = await this.getSession();
    const response = await this.withRetry(() => this.request('get', `${config.endpoints.queryStatus}/${encodeURIComponent(transactionId)}`, undefined, session));
    const data = response.data || {};
    return {
      transactionId: data.transactionId || transactionId,
      status: String(data.status || 'unknown').toLowerCase(),
      success: ['success', 'completed', 'successful'].includes(String(data.status).toLowerCase()),
      amount: data.amount,
      receipt: data.receipt || data.receiptNumber,
      message: data.message,
      rawResponse: data
    };
  }

  async reverseTransaction(transactionId, amount, reason = 'Motsamai refund') {
    const session = await this.getSession();
    const payload = { transactionId, reason: String(reason).slice(0, 100) };
    if (amount !== undefined) payload.amount = this.validateAmount(amount);
    const response = await this.withRetry(() => this.request('post', config.endpoints.reversal, payload, session));
    const data = response.data || {};
    return { success: ['success', 'completed'].includes(String(data.status).toLowerCase()), transactionId, reversalId: data.reversalId || data.id, status: data.status, rawResponse: data };
  }

  handleCallback(callbackData) {
    const data = callbackData || {};
    const status = String(data.status || data.result || '').toLowerCase();
    return {
      transactionId: data.transactionId || data.transactionReference || data.reference,
      status,
      success: ['success', 'completed', 'successful'].includes(status),
      amount: data.amount,
      receipt: data.receipt || data.receiptNumber,
      rawData: data
    };
  }

  async healthCheck() {
    try {
      await this.getSession();
      return { status: 'healthy', country: config.country, environment: config.environment, currency: config.currency };
    } catch (error) {
      return { status: 'unhealthy', country: config.country, environment: config.environment, error: error.message };
    }
  }
}

module.exports = new VodacomLesothoService();
