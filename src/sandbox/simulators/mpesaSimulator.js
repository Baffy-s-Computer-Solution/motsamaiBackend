/**
 * M-Pesa Sandbox Simulator
 * Mimics M-Pesa API behavior for testing
 * @module sandbox/simulators/mpesaSimulator
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class MpesaSandboxSimulator {
  constructor() {
    this.transactions = new Map();
    this.queuedCallbacks = [];
    this.simulationDelay = 2000; // 2 seconds delay
    this.failureRate = 0; // 0% failure rate for sandbox (configurable)
    this.callbackUrls = new Map();
    
    // Test accounts
    this.testAccounts = {
      customer: {
        '26650000001': { balance: 10000, name: 'Test Customer 1', pin: '1234' },
        '26650000002': { balance: 5000, name: 'Test Customer 2', pin: '1234' },
        '26650000003': { balance: 25000, name: 'Premium Customer', pin: '1234' },
        '26660000001': { balance: 7500, name: 'Test Customer 3', pin: '1234' },
        '26660000002': { balance: 3000, name: 'Low Balance Customer', pin: '1234' }
      },
      business: {
        '174379': { name: 'Motsamai Business', balance: 100000, type: 'paybill' },
        '174380': { name: 'Motsamai Till', balance: 50000, type: 'till' }
      }
    };
    
    // Mock responses for different scenarios
    this.scenarios = {
      success: {
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Payment received successfully'
      },
      insufficient_balance: {
        ResponseCode: '1001',
        ResponseDescription: 'Insufficient funds in customer account',
        CustomerMessage: 'Insufficient balance'
      },
      invalid_phone: {
        ResponseCode: '1002',
        ResponseDescription: 'Invalid phone number format',
        CustomerMessage: 'Please check your phone number'
      },
      timeout: {
        ResponseCode: '1006',
        ResponseDescription: 'Request timed out',
        CustomerMessage: 'Transaction timeout'
      },
      cancelled: {
        ResponseCode: '1037',
        ResponseDescription: 'Transaction cancelled by user',
        CustomerMessage: 'You cancelled the transaction'
      },
      duplicate: {
        ResponseCode: '1003',
        ResponseDescription: 'Duplicate transaction detected',
        CustomerMessage: 'Transaction already processed'
      }
    };
  }

  /**
   * Simulate OAuth token generation
   */
  async generateToken() {
    logger.info('[MPESA SIMULATOR] Generating access token');
    
    return {
      access_token: `sandbox_token_${crypto.randomBytes(32).toString('hex')}`,
      expires_in: 3600,
      token_type: 'Bearer'
    };
  }

  /**
   * Simulate STK Push
   */
  async stkPush(requestBody) {
    const {
      BusinessShortCode,
      Amount,
      PartyA,
      PhoneNumber,
      AccountReference,
      TransactionDesc
    } = requestBody;

    logger.info(`[MPESA SIMULATOR] STK Push request:`, {
      amount: Amount,
      phone: PartyA,
      reference: AccountReference
    });

    // Validate phone number
    if (!this.isValidPhoneNumber(PartyA)) {
      return this.createErrorResponse('1002', 'Invalid phone number');
    }

    // Check if test account exists
    const account = this.testAccounts.customer[PartyA];
    if (!account) {
      // Simulate new account
      this.testAccounts.customer[PartyA] = {
        balance: 10000,
        name: `Test User ${PartyA}`,
        pin: '1234'
      };
    }

    // Simulate random failure based on rate
    if (Math.random() < this.failureRate) {
      return this.createErrorResponse('1001', 'Simulated random failure');
    }

    const checkoutRequestId = `ws_CO_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const merchantRequestId = `ws_MR_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Store transaction
    const transaction = {
      checkoutRequestId,
      merchantRequestId,
      amount: Amount,
      phoneNumber: PartyA,
      accountReference: AccountReference,
      description: TransactionDesc,
      status: 'PENDING',
      createdAt: new Date(),
      callbackAttempts: 0
    };
    
    this.transactions.set(checkoutRequestId, transaction);

    // Schedule callback simulation
    this.scheduleCallback(checkoutRequestId, transaction);

    return {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Enter your PIN to complete transaction'
    };
  }

  /**
   * Simulate STK Query
   */
  async queryStkStatus(checkoutRequestId) {
    const transaction = this.transactions.get(checkoutRequestId);
    
    if (!transaction) {
      return {
        ResultCode: '1002',
        ResultDesc: 'Transaction not found'
      };
    }

    const statusMap = {
      'PENDING': { code: '1001', desc: 'Request is being processed' },
      'COMPLETED': { code: '0', desc: 'The transaction was successful' },
      'FAILED': { code: '1032', desc: 'Transaction failed' },
      'CANCELLED': { code: '1037', desc: 'Transaction cancelled by user' }
    };

    const status = statusMap[transaction.status] || statusMap.PENDING;

    return {
      ResultCode: status.code,
      ResultDesc: status.desc,
      CheckoutRequestID: checkoutRequestId,
      Amount: transaction.amount,
      ReceiptNumber: transaction.status === 'COMPLETED' ? this.generateReceiptNumber() : null,
      TransactionDate: transaction.status === 'COMPLETED' ? this.formatDate(new Date()) : null
    };
  }

  /**
   * Simulate B2C Payment
   */
  async b2cPayment(requestBody) {
    const {
      InitiatorName,
      Amount,
      PartyB,
      Remarks
    } = requestBody;

    logger.info(`[MPESA SIMULATOR] B2C Payment:`, {
      amount: Amount,
      recipient: PartyB,
      remarks: Remarks
    });

    if (!this.isValidPhoneNumber(PartyB)) {
      return this.createB2CErrorResponse('1002', 'Invalid recipient phone number');
    }

    const recipientAccount = this.testAccounts.customer[PartyB];
    if (!recipientAccount) {
      return this.createB2CErrorResponse('1004', 'Recipient not registered');
    }

    const conversationId = `B2C_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const originatorConversationId = `B2C_ORG_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Update balance
    recipientAccount.balance += Amount;
    
    const transaction = {
      conversationId,
      originatorConversationId,
      amount: Amount,
      recipient: PartyB,
      status: 'COMPLETED',
      completedAt: new Date()
    };
    
    this.transactions.set(conversationId, transaction);

    return {
      ConversationID: conversationId,
      OriginatorConversationID: originatorConversationId,
      ResponseCode: '0',
      ResponseDescription: 'Accept the service request successfully.'
    };
  }

  /**
   * Schedule callback simulation
   */
  scheduleCallback(checkoutRequestId, transaction) {
    setTimeout(async () => {
      try {
        // Simulate user action (70% success, 20% fail, 10% cancel)
        const random = Math.random();
        let result;
        
        if (random < 0.7) {
          result = this.scenarios.success;
          transaction.status = 'COMPLETED';
          transaction.receiptNumber = this.generateReceiptNumber();
          transaction.completedAt = new Date();
          
          // Update account balance
          const account = this.testAccounts.customer[transaction.phoneNumber];
          if (account) {
            account.balance -= transaction.amount;
          }
        } else if (random < 0.85) {
          result = this.scenarios.insufficient_balance;
          transaction.status = 'FAILED';
        } else if (random < 0.95) {
          result = this.scenarios.cancelled;
          transaction.status = 'CANCELLED';
        } else {
          result = this.scenarios.timeout;
          transaction.status = 'TIMEOUT';
        }
        
        transaction.result = result;
        this.transactions.set(checkoutRequestId, transaction);
        
        // Send callback if URL exists
        await this.sendCallback(checkoutRequestId, transaction);
        
        logger.info(`[MPESA SIMULATOR] Transaction ${checkoutRequestId} completed with status: ${transaction.status}`);
      } catch (error) {
        logger.error(`[MPESA SIMULATOR] Callback simulation failed:`, error);
      }
    }, this.simulationDelay);
  }

  /**
   * Send callback to registered URL
   */
  async sendCallback(checkoutRequestId, transaction) {
    const callbackUrl = this.callbackUrls.get(checkoutRequestId);
    
    if (!callbackUrl) {
      logger.info(`[MPESA SIMULATOR] No callback URL for ${checkoutRequestId}`);
      return;
    }
    
    const callbackPayload = {
      ResultCode: transaction.result.ResponseCode,
      ResultDesc: transaction.result.ResponseDescription,
      CheckoutRequestID: checkoutRequestId,
      ResultType: 0,
      TransactionID: transaction.receiptNumber || null,
      Amount: transaction.amount,
      ReceiptNumber: transaction.receiptNumber,
      TransactionDate: this.formatDate(transaction.completedAt || new Date()),
      PhoneNumber: transaction.phoneNumber,
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: transaction.amount },
          { Name: 'MpesaReceiptNumber', Value: transaction.receiptNumber },
          { Name: 'TransactionDate', Value: this.formatDate(transaction.completedAt || new Date()) },
          { Name: 'PhoneNumber', Value: transaction.phoneNumber }
        ]
      }
    };
    
    try {
      const axios = require('axios');
      await axios.post(callbackUrl, callbackPayload);
      logger.info(`[MPESA SIMULATOR] Callback sent successfully for ${checkoutRequestId}`);
    } catch (error) {
      logger.error(`[MPESA SIMULATOR] Failed to send callback:`, error);
      
      // Retry logic
      if (transaction.callbackAttempts < 3) {
        transaction.callbackAttempts++;
        setTimeout(() => this.sendCallback(checkoutRequestId, transaction), 5000);
      }
    }
  }

  /**
   * Register callback URL for transaction
   */
  registerCallback(checkoutRequestId, callbackUrl) {
    this.callbackUrls.set(checkoutRequestId, callbackUrl);
  }

  /**
   * Simulate transaction reversal
   */
  async reverseTransaction(requestBody) {
    const { TransactionID, Amount, ReceiverParty } = requestBody;
    
    logger.info(`[MPESA SIMULATOR] Reverse transaction: ${TransactionID}`);
    
    // Find original transaction
    let originalTransaction = null;
    for (const [id, tx] of this.transactions.entries()) {
      if (tx.conversationId === TransactionID || tx.checkoutRequestId === TransactionID) {
        originalTransaction = tx;
        break;
      }
    }
    
    if (!originalTransaction) {
      return {
        ResponseCode: '1002',
        ResponseDescription: 'Original transaction not found'
      };
    }
    
    if (originalTransaction.status !== 'COMPLETED') {
      return {
        ResponseCode: '1003',
        ResponseDescription: 'Only completed transactions can be reversed'
      };
    }
    
    // Reverse the transaction
    originalTransaction.status = 'REVERSED';
    originalTransaction.reversedAt = new Date();
    
    // Refund amount to account
    const account = this.testAccounts.customer[originalTransaction.phoneNumber];
    if (account) {
      account.balance += originalTransaction.amount;
    }
    
    return {
      ConversationID: `REV_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      ResponseCode: '0',
      ResponseDescription: 'Transaction reversal successful'
    };
  }

  /**
   * Helper methods
   */
  isValidPhoneNumber(phone) {
    const phoneStr = phone.toString();
    return /^266[568][0-9]{7}$/.test(phoneStr) || /^[568][0-9]{7}$/.test(phoneStr);
  }

  generateReceiptNumber() {
    return `S${Math.random().toString(36).substring(2, 10).toUpperCase()}${Date.now().toString().slice(-6)}`;
  }

  formatDate(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  }

  createErrorResponse(code, description) {
    const scenario = Object.values(this.scenarios).find(s => s.ResponseCode === code) || {
      ResponseCode: code,
      ResponseDescription: description,
      CustomerMessage: description
    };
    
    return {
      MerchantRequestID: `ERR_${Date.now()}`,
      CheckoutRequestID: `ERR_${Date.now()}`,
      ResponseCode: scenario.ResponseCode,
      ResponseDescription: scenario.ResponseDescription,
      CustomerMessage: scenario.CustomerMessage
    };
  }

  createB2CErrorResponse(code, description) {
    return {
      ConversationID: `ERR_${Date.now()}`,
      OriginatorConversationID: `ERR_${Date.now()}`,
      ResponseCode: code,
      ResponseDescription: description
    };
  }

  /**
   * Set simulation parameters
   */
  setSimulationParams({ delay, failureRate }) {
    if (delay !== undefined) this.simulationDelay = delay;
    if (failureRate !== undefined) this.failureRate = Math.min(1, Math.max(0, failureRate));
    logger.info(`[MPESA SIMULATOR] Updated simulation params: delay=${this.simulationDelay}ms, failureRate=${this.failureRate}`);
  }

  /**
   * Get simulation stats
   */
  getStats() {
    const stats = {
      totalTransactions: this.transactions.size,
      pending: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      reversed: 0,
      testAccounts: Object.keys(this.testAccounts.customer).length,
      activeCallbacks: this.callbackUrls.size
    };
    
    for (const tx of this.transactions.values()) {
      stats[tx.status.toLowerCase()]++;
    }
    
    return stats;
  }

  /**
   * Reset simulator state
   */
  reset() {
    this.transactions.clear();
    this.callbackUrls.clear();
    this.failureRate = 0;
    logger.info('[MPESA SIMULATOR] State reset');
  }
}

module.exports = new MpesaSandboxSimulator();