/**
 * EcoCash Sandbox Simulator
 * Mimics EcoCash Lesotho API behavior for testing
 * @module sandbox/simulators/ecocashSimulator
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

class EcoCashSandboxSimulator {
  constructor() {
    this.transactions = new Map();
    this.paymentSessions = new Map();
    this.simulationDelay = 3000; // 3 seconds
    this.failureRate = 0;
    this.webhookQueue = [];
    
    // Test accounts
    this.testAccounts = {
      customers: {
        '26650000001': { balance: 15000, name: 'Eco User 1', verified: true },
        '26650000002': { balance: 8000, name: 'Eco User 2', verified: true },
        '26650000003': { balance: 30000, name: 'Premium User', verified: true },
        '26660000001': { balance: 5000, name: 'Standard User', verified: true },
        '26660000002': { balance: 1000, name: 'Low Balance User', verified: true }
      },
      merchants: {
        'EASYGO001': { name: 'Motsamai', balance: 200000, category: 'Transport' }
      }
    };
    
    // Response templates
    this.responses = {
      success: {
        status: 'SUCCESS',
        message: 'Payment initiated successfully',
        responseCode: '00'
      },
      pending: {
        status: 'PENDING',
        message: 'Payment pending customer confirmation',
        responseCode: '01'
      },
      insufficientFunds: {
        status: 'FAILED',
        message: 'Insufficient funds',
        responseCode: '51'
      },
      invalidAccount: {
        status: 'FAILED',
        message: 'Invalid customer account',
        responseCode: '14'
      },
      timeout: {
        status: 'TIMEOUT',
        message: 'Transaction timeout',
        responseCode: '68'
      },
      duplicate: {
        status: 'FAILED',
        message: 'Duplicate transaction detected',
        responseCode: '94'
      },
      limitExceeded: {
        status: 'FAILED',
        message: 'Transaction limit exceeded',
        responseCode: '61'
      }
    };
  }

  /**
   * Simulate token generation
   */
  async generateToken() {
    logger.info('[ECOCASH SIMULATOR] Generating access token');
    
    return {
      access_token: `ecocash_sandbox_${crypto.randomBytes(32).toString('hex')}`,
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'merchant_payment'
    };
  }

  /**
   * Simulate payment initiation
   */
  async initiatePayment(requestBody) {
    const {
      merchantId,
      amount,
      customerMsisdn,
      transactionReference,
      transactionDescription,
      callbackUrl
    } = requestBody;

    logger.info(`[ECOCASH SIMULATOR] Payment initiation:`, {
      amount: amount / 100,
      customer: customerMsisdn,
      reference: transactionReference
    });

    // Validate customer
    if (!this.isValidCustomer(customerMsisdn)) {
      return this.createErrorResponse('invalidAccount', 'Customer not registered');
    }

    // Check balance
    const customer = this.testAccounts.customers[customerMsisdn];
    const amountInLSL = amount / 100;
    
    if (customer.balance < amountInLSL) {
      return this.createErrorResponse('insufficientFunds', 'Insufficient balance');
    }

    // Generate transaction IDs
    const transactionId = `EC_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const referenceId = `REF_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Random success/failure based on rate
    const random = Math.random();
    let status, paymentUrl;
    
    if (random < this.failureRate) {
      status = 'FAILED';
      paymentUrl = null;
    } else if (random < 0.05) {
      status = 'TIMEOUT';
      paymentUrl = null;
    } else {
      status = 'PENDING';
      // Generate payment URL for customer to complete
      paymentUrl = `https://sandbox.ecocash.co.ls/pay/${transactionId}`;
    }
    
    // Store transaction
    const transaction = {
      transactionId,
      referenceId,
      amount: amountInLSL,
      currency: 'LSL',
      customerMsisdn,
      merchantId,
      reference: transactionReference,
      description: transactionDescription,
      status,
      callbackUrl,
      createdAt: new Date(),
      paymentUrl
    };
    
    this.transactions.set(transactionId, transaction);
    
    // If not failed, schedule completion
    if (status !== 'FAILED') {
      this.scheduleCompletion(transactionId, callbackUrl);
    }
    
    // Create payment session
    this.paymentSessions.set(transactionId, {
      transaction,
      attempts: 0,
      completedAt: null
    });
    
    return {
      transactionId,
      referenceId,
      status,
      paymentUrl,
      message: this.responses[status.toLowerCase()]?.message || 'Payment initiated',
      responseCode: this.responses[status.toLowerCase()]?.responseCode || '00'
    };
  }

  /**
   * Simulate payment completion
   */
  async completePayment(transactionId, pin = '1234') {
    const session = this.paymentSessions.get(transactionId);
    
    if (!session) {
      return {
        status: 'FAILED',
        message: 'Transaction not found'
      };
    }
    
    const transaction = session.transaction;
    
    if (transaction.status !== 'PENDING') {
      return {
        status: transaction.status,
        message: `Transaction already ${transaction.status.toLowerCase()}`
      };
    }
    
    // Validate PIN (in sandbox, any 4-digit PIN works)
    if (!pin || pin.length !== 4) {
      return {
        status: 'FAILED',
        message: 'Invalid PIN'
      };
    }
    
    // Simulate processing
    const random = Math.random();
    let result;
    
    if (random < 0.9) {
      // Success
      transaction.status = 'SUCCESS';
      transaction.completedAt = new Date();
      transaction.settlementDate = new Date();
      transaction.settlementReference = `SET_${Date.now()}`;
      transaction.receiptNumber = this.generateReceiptNumber();
      
      // Deduct from customer balance
      const customer = this.testAccounts.customers[transaction.customerMsisdn];
      if (customer) {
        customer.balance -= transaction.amount;
      }
      
      // Add to merchant balance
      const merchant = this.testAccounts.merchants[transaction.merchantId];
      if (merchant) {
        merchant.balance += transaction.amount;
      }
      
      result = {
        status: 'SUCCESS',
        message: 'Payment completed successfully',
        receiptNumber: transaction.receiptNumber,
        settlementReference: transaction.settlementReference,
        completedAt: transaction.completedAt
      };
    } else if (random < 0.95) {
      // Customer cancelled
      transaction.status = 'CANCELLED';
      result = {
        status: 'CANCELLED',
        message: 'Payment cancelled by customer'
      };
    } else {
      // Technical failure
      transaction.status = 'FAILED';
      result = {
        status: 'FAILED',
        message: 'Technical error processing payment'
      };
    }
    
    this.transactions.set(transactionId, transaction);
    session.completedAt = new Date();
    this.paymentSessions.set(transactionId, session);
    
    // Send webhook
    await this.sendWebhook(transaction);
    
    return result;
  }

  /**
   * Simulate payment query
   */
  async queryPayment(transactionId) {
    const transaction = this.transactions.get(transactionId);
    
    if (!transaction) {
      return {
        status: 'NOT_FOUND',
        message: 'Transaction not found',
        responseCode: '25'
      };
    }
    
    return {
      transactionId: transaction.transactionId,
      referenceId: transaction.referenceId,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      customerMsisdn: transaction.customerMsisdn,
      merchantId: transaction.merchantId,
      completedAt: transaction.completedAt,
      settlementDate: transaction.settlementDate,
      receiptNumber: transaction.receiptNumber,
      message: `Transaction ${transaction.status.toLowerCase()}`,
      responseCode: transaction.status === 'SUCCESS' ? '00' : '01'
    };
  }

  /**
   * Simulate reversal
   */
  async reversePayment(originalTransactionId, amount, reason) {
    const originalTransaction = this.transactions.get(originalTransactionId);
    
    if (!originalTransaction) {
      return this.createErrorResponse('invalidAccount', 'Original transaction not found');
    }
    
    if (originalTransaction.status !== 'SUCCESS') {
      return this.createErrorResponse('invalidAccount', 'Only successful transactions can be reversed');
    }
    
    if (amount > originalTransaction.amount) {
      return this.createErrorResponse('limitExceeded', 'Reversal amount exceeds original amount');
    }
    
    // Process reversal
    const reversalTransactionId = `REV_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Refund customer
    const customer = this.testAccounts.customers[originalTransaction.customerMsisdn];
    if (customer) {
      customer.balance += amount;
    }
    
    // Deduct from merchant
    const merchant = this.testAccounts.merchants[originalTransaction.merchantId];
    if (merchant) {
      merchant.balance -= amount;
    }
    
    const reversalTransaction = {
      transactionId: reversalTransactionId,
      originalTransactionId,
      amount,
      reason,
      status: 'SUCCESS',
      createdAt: new Date(),
      type: 'REVERSAL'
    };
    
    this.transactions.set(reversalTransactionId, reversalTransaction);
    
    return {
      reverseTransactionId: reversalTransactionId,
      status: 'SUCCESS',
      message: 'Payment reversed successfully',
      responseCode: '00'
    };
  }

  /**
   * Schedule transaction completion
   */
  scheduleCompletion(transactionId, callbackUrl) {
    setTimeout(async () => {
      const session = this.paymentSessions.get(transactionId);
      if (!session || session.transaction.status !== 'PENDING') return;
      
      // If still pending after timeout, mark as timeout
      if (session.transaction.status === 'PENDING') {
        session.transaction.status = 'TIMEOUT';
        this.transactions.set(transactionId, session.transaction);
        
        await this.sendWebhook(session.transaction);
        logger.info(`[ECOCASH SIMULATOR] Transaction ${transactionId} timed out`);
      }
    }, this.simulationDelay + 5000);
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(transaction) {
    if (!transaction.callbackUrl) return;
    
    const webhookPayload = {
      transactionId: transaction.transactionId,
      referenceId: transaction.referenceId,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      customerMsisdn: transaction.customerMsisdn,
      merchantId: transaction.merchantId,
      completedAt: transaction.completedAt,
      settlementDate: transaction.settlementDate,
      receiptNumber: transaction.receiptNumber,
      timestamp: new Date().toISOString(),
      signature: this.generateSignature(transaction)
    };
    
    try {
      const axios = require('axios');
      await axios.post(transaction.callbackUrl, webhookPayload, {
        headers: { 'X-Webhook-Signature': webhookPayload.signature }
      });
      logger.info(`[ECOCASH SIMULATOR] Webhook sent for ${transaction.transactionId}`);
    } catch (error) {
      logger.error(`[ECOCASH SIMULATOR] Webhook failed:`, error);
      
      // Queue for retry
      this.webhookQueue.push({
        transaction,
        attempts: 1,
        nextRetry: Date.now() + 5000
      });
      
      this.processWebhookQueue();
    }
  }

  /**
   * Process webhook queue
   */
  async processWebhookQueue() {
    const now = Date.now();
    const toProcess = this.webhookQueue.filter(item => item.nextRetry <= now);
    
    for (const item of toProcess) {
      if (item.attempts >= 3) {
        logger.error(`[ECOCASH SIMULATOR] Webhook failed after 3 attempts for ${item.transaction.transactionId}`);
        continue;
      }
      
      await this.sendWebhook(item.transaction);
      item.attempts++;
      item.nextRetry = now + (5000 * item.attempts);
    }
    
    setTimeout(() => this.processWebhookQueue(), 5000);
  }

  /**
   * Helper methods
   */
  isValidCustomer(msisdn) {
    const msisdnStr = msisdn.toString();
    return /^266[568][0-9]{7}$/.test(msisdnStr) && this.testAccounts.customers[msisdnStr];
  }

  generateReceiptNumber() {
    return `RC${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString().slice(-4)}`;
  }

  generateSignature(transaction) {
    const data = `${transaction.transactionId}${transaction.amount}${transaction.status}${transaction.timestamp || Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  createErrorResponse(type, customMessage = null) {
    const response = this.responses[type] || this.responses.failed;
    return {
      status: response.status,
      message: customMessage || response.message,
      responseCode: response.responseCode
    };
  }

  /**
   * Set simulation parameters
   */
  setSimulationParams({ delay, failureRate }) {
    if (delay !== undefined) this.simulationDelay = delay;
    if (failureRate !== undefined) this.failureRate = Math.min(1, Math.max(0, failureRate));
    logger.info(`[ECOCASH SIMULATOR] Updated: delay=${this.simulationDelay}ms, failureRate=${this.failureRate}`);
  }

  /**
   * Get simulation stats
   */
  getStats() {
    const stats = {
      totalTransactions: this.transactions.size,
      activeSessions: this.paymentSessions.size,
      success: 0,
      pending: 0,
      failed: 0,
      cancelled: 0,
      timeout: 0,
      webhookQueue: this.webhookQueue.length,
      customerBalance: Object.values(this.testAccounts.customers).reduce((sum, c) => sum + c.balance, 0),
      merchantBalance: Object.values(this.testAccounts.merchants).reduce((sum, m) => sum + m.balance, 0)
    };
    
    for (const tx of this.transactions.values()) {
      const status = tx.status.toLowerCase();
      if (stats[status] !== undefined) stats[status]++;
    }
    
    return stats;
  }

  /**
   * Reset simulator
   */
  reset() {
    this.transactions.clear();
    this.paymentSessions.clear();
    this.webhookQueue = [];
    this.failureRate = 0;
    
    // Reset balances
    Object.values(this.testAccounts.customers).forEach(c => { c.balance = 10000; });
    Object.values(this.testAccounts.merchants).forEach(m => { m.balance = 200000; });
    
    logger.info('[ECOCASH SIMULATOR] State reset');
  }

  /**
   * Generate test data
   */
  generateTestData(count = 10) {
    const testTransactions = [];
    for (let i = 0; i < count; i++) {
      const amount = Math.floor(Math.random() * 5000) + 100;
      const customerMsisdn = `266${Math.random() > 0.5 ? '5' : '6'}${Math.floor(Math.random() * 90000000) + 1000000}`;
      
      testTransactions.push({
        amount,
        customerMsisdn,
        reference: `TEST_${Date.now()}_${i}`
      });
    }
    return testTransactions;
  }
}

module.exports = new EcoCashSandboxSimulator();