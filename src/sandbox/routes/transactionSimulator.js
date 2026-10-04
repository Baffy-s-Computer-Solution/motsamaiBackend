/**
 * Transaction Simulator
 * Simulates complex transaction scenarios
 * @module sandbox/services/transactionSimulator
 */

const mpesaSimulator = require('../simulators/mpesaSimulator');
const ecocashSimulator = require('../simulators/ecocashSimulator');
const logger = require('../../utils/logger');

class TransactionSimulator {
  constructor() {
    this.scenarios = {
      'happy-path': this.happyPathScenario.bind(this),
      'insufficient-balance': this.insufficientBalanceScenario.bind(this),
      'network-timeout': this.networkTimeoutScenario.bind(this),
      'concurrent-payments': this.concurrentPaymentsScenario.bind(this),
      'bulk-payouts': this.bulkPayoutsScenario.bind(this),
      'partial-failures': this.partialFailuresScenario.bind(this),
      'recovery-flow': this.recoveryFlowScenario.bind(this)
    };
  }

  /**
   * Happy path scenario - all transactions succeed
   */
  async happyPathScenario(provider, count = 5) {
    const results = [];
    
    for (let i = 0; i < count; i++) {
      try {
        let result;
        if (provider === 'MPESA') {
          result = await mpesaSimulator.stkPush({
            BusinessShortCode: '174379',
            Amount: 100 + (i * 50),
            PartyA: `2665000000${i + 1}`,
            PhoneNumber: `2665000000${i + 1}`,
            AccountReference: `HAPPY_${i}`,
            TransactionDesc: `Happy path test ${i}`
          });
        } else {
          result = await ecocashSimulator.initiatePayment({
            merchantId: 'EASYGO001',
            amount: (100 + (i * 50)) * 100,
            customerMsisdn: `2665000000${i + 1}`,
            transactionReference: `HAPPY_${i}`,
            transactionDescription: `Happy path test ${i}`
          });
          
          // Complete the payment automatically
          if (result.transactionId) {
            await ecocashSimulator.completePayment(result.transactionId);
          }
        }
        
        results.push({ success: true, result, index: i });
      } catch (error) {
        results.push({ success: false, error: error.message, index: i });
      }
    }
    
    return {
      scenario: 'happy-path',
      provider,
      totalAttempts: count,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Insufficient balance scenario
   */
  async insufficientBalanceScenario(provider) {
    const results = [];
    const highAmount = 1000000; // Amount higher than test account balance
    
    try {
      let result;
      if (provider === 'MPESA') {
        result = await mpesaSimulator.stkPush({
          BusinessShortCode: '174379',
          Amount: highAmount,
          PartyA: '26650000001',
          PhoneNumber: '26650000001',
          AccountReference: 'INSUFFICIENT',
          TransactionDesc: 'Testing insufficient balance'
        });
      } else {
        result = await ecocashSimulator.initiatePayment({
          merchantId: 'EASYGO001',
          amount: highAmount * 100,
          customerMsisdn: '26650000001',
          transactionReference: 'INSUFFICIENT',
          transactionDescription: 'Testing insufficient balance'
        });
      }
      
      results.push({ success: false, expectedFailure: true, result, reason: 'Insufficient balance' });
    } catch (error) {
      results.push({ success: true, expectedFailure: true, error: error.message });
    }
    
    return {
      scenario: 'insufficient-balance',
      provider,
      attemptedAmount: highAmount,
      results
    };
  }

  /**
   * Network timeout scenario
   */
  async networkTimeoutScenario(provider) {
    // Temporarily increase delay to simulate timeout
    const originalDelay = provider === 'MPESA' ? mpesaSimulator.simulationDelay : ecocashSimulator.simulationDelay;
    
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ delay: 35000 }); // 35 seconds timeout
    } else {
      ecocashSimulator.setSimulationParams({ delay: 35000 });
    }
    
    const results = [];
    
    try {
      let result;
      if (provider === 'MPESA') {
        result = await mpesaSimulator.stkPush({
          BusinessShortCode: '174379',
          Amount: 100,
          PartyA: '26650000001',
          PhoneNumber: '26650000001',
          AccountReference: 'TIMEOUT',
          TransactionDesc: 'Testing timeout'
        });
      } else {
        result = await ecocashSimulator.initiatePayment({
          merchantId: 'EASYGO001',
          amount: 100 * 100,
          customerMsisdn: '26650000001',
          transactionReference: 'TIMEOUT',
          transactionDescription: 'Testing timeout'
        });
      }
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 40000));
      
      // Check status
      let status;
      if (provider === 'MPESA') {
        status = await mpesaSimulator.queryStkStatus(result.CheckoutRequestID);
      } else {
        status = await ecocashSimulator.queryPayment(result.transactionId);
      }
      
      results.push({ success: false, expectedFailure: true, status, reason: 'Should have timed out' });
    } catch (error) {
      results.push({ success: true, expectedFailure: true, error: error.message });
    }
    
    // Restore original delay
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ delay: originalDelay });
    } else {
      ecocashSimulator.setSimulationParams({ delay: originalDelay });
    }
    
    return {
      scenario: 'network-timeout',
      provider,
      results
    };
  }

  /**
   * Concurrent payments scenario
   */
  async concurrentPaymentsScenario(provider, concurrentCount = 10) {
    const promises = [];
    
    for (let i = 0; i < concurrentCount; i++) {
      if (provider === 'MPESA') {
        promises.push(
          mpesaSimulator.stkPush({
            BusinessShortCode: '174379',
            Amount: 50 + (i * 10),
            PartyA: `2665000000${(i % 5) + 1}`,
            PhoneNumber: `2665000000${(i % 5) + 1}`,
            AccountReference: `CONCURRENT_${i}`,
            TransactionDesc: `Concurrent test ${i}`
          }).catch(e => ({ error: e.message }))
        );
      } else {
        promises.push(
          ecocashSimulator.initiatePayment({
            merchantId: 'EASYGO001',
            amount: (50 + (i * 10)) * 100,
            customerMsisdn: `2665000000${(i % 5) + 1}`,
            transactionReference: `CONCURRENT_${i}`,
            transactionDescription: `Concurrent test ${i}`
          }).catch(e => ({ error: e.message }))
        );
      }
    }
    
    const results = await Promise.all(promises);
    const successful = results.filter(r => !r.error && r.ResponseCode === '0').length;
    
    return {
      scenario: 'concurrent-payments',
      provider,
      concurrentCount,
      successful,
      failed: concurrentCount - successful,
      results
    };
  }

  /**
   * Bulk payouts scenario
   */
  async bulkPayoutsScenario(count = 20) {
    const recipients = [];
    for (let i = 0; i < count; i++) {
      recipients.push({
        phone: `2665000000${(i % 5) + 1}`,
        amount: 100 + (i * 50),
        reference: `BULK_${i}`
      });
    }
    
    const results = [];
    let totalAmount = 0;
    
    for (const recipient of recipients) {
      try {
        const result = await mpesaSimulator.b2cPayment({
          InitiatorName: 'Motsamai',
          Amount: recipient.amount,
          PartyB: recipient.phone,
          Remarks: 'Bulk payout test',
          Occasion: 'Weekly earnings'
        });
        
        results.push({
          success: true,
          recipient: recipient.phone,
          amount: recipient.amount,
          result
        });
        totalAmount += recipient.amount;
      } catch (error) {
        results.push({
          success: false,
          recipient: recipient.phone,
          amount: recipient.amount,
          error: error.message
        });
      }
    }
    
    return {
      scenario: 'bulk-payouts',
      totalRecipients: count,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalAmount,
      results
    };
  }

  /**
   * Partial failures scenario
   */
  async partialFailuresScenario(provider) {
    // Set 30% failure rate
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ failureRate: 0.3 });
    } else {
      ecocashSimulator.setSimulationParams({ failureRate: 0.3 });
    }
    
    const results = await this.happyPathScenario(provider, 20);
    
    // Reset failure rate
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ failureRate: 0 });
    } else {
      ecocashSimulator.setSimulationParams({ failureRate: 0 });
    }
    
    return {
      ...results,
      scenario: 'partial-failures',
      failureRate: 0.3
    };
  }

  /**
   * Recovery flow scenario (transaction failure -> retry -> success)
   */
  async recoveryFlowScenario(provider) {
    const results = [];
    
    // First attempt with guaranteed failure
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ failureRate: 1.0 });
    } else {
      ecocashSimulator.setSimulationParams({ failureRate: 1.0 });
    }
    
    let firstAttempt;
    try {
      if (provider === 'MPESA') {
        firstAttempt = await mpesaSimulator.stkPush({
          BusinessShortCode: '174379',
          Amount: 100,
          PartyA: '26650000001',
          PhoneNumber: '26650000001',
          AccountReference: 'RECOVERY',
          TransactionDesc: 'Recovery test - first attempt'
        });
      } else {
        firstAttempt = await ecocashSimulator.initiatePayment({
          merchantId: 'EASYGO001',
          amount: 100 * 100,
          customerMsisdn: '26650000001',
          transactionReference: 'RECOVERY',
          transactionDescription: 'Recovery test - first attempt'
        });
      }
    } catch (error) {
      results.push({ attempt: 1, success: false, error: error.message });
    }
    
    // Reset failure rate and retry
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ failureRate: 0 });
    } else {
      ecocashSimulator.setSimulationParams({ failureRate: 0 });
    }
    
    let secondAttempt;
    try {
      if (provider === 'MPESA') {
        secondAttempt = await mpesaSimulator.stkPush({
          BusinessShortCode: '174379',
          Amount: 100,
          PartyA: '26650000001',
          PhoneNumber: '26650000001',
          AccountReference: 'RECOVERY_RETRY',
          TransactionDesc: 'Recovery test - second attempt'
        });
        results.push({ attempt: 2, success: true, result: secondAttempt });
      } else {
        secondAttempt = await ecocashSimulator.initiatePayment({
          merchantId: 'EASYGO001',
          amount: 100 * 100,
          customerMsisdn: '26650000001',
          transactionReference: 'RECOVERY_RETRY',
          transactionDescription: 'Recovery test - second attempt'
        });
        
        if (secondAttempt.transactionId) {
          const complete = await ecocashSimulator.completePayment(secondAttempt.transactionId);
          results.push({ attempt: 2, success: true, result: secondAttempt, complete });
        } else {
          results.push({ attempt: 2, success: true, result: secondAttempt });
        }
      }
    } catch (error) {
      results.push({ attempt: 2, success: false, error: error.message });
    }
    
    return {
      scenario: 'recovery-flow',
      provider,
      results,
      recovered: results[1]?.success || false
    };
  }

  /**
   * Run a specific scenario
   */
  async runScenario(scenarioName, provider, count = 5) {
    const scenario = this.scenarios[scenarioName];
    
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}. Available: ${Object.keys(this.scenarios).join(', ')}`);
    }
    
    logger.info(`Running scenario: ${scenarioName} for ${provider}`);
    
    const startTime = Date.now();
    const result = await scenario(provider, count);
    const duration = Date.now() - startTime;
    
    return {
      ...result,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get available scenarios
   */
  getScenarios() {
    return Object.keys(this.scenarios).map(name => ({
      name,
      description: this.getScenarioDescription(name)
    }));
  }

  getScenarioDescription(name) {
    const descriptions = {
      'happy-path': 'All transactions succeed as expected',
      'insufficient-balance': 'Test handling of insufficient funds',
      'network-timeout': 'Simulate network timeout scenarios',
      'concurrent-payments': 'Multiple simultaneous payments',
      'bulk-payouts': 'Batch payments to multiple recipients',
      'partial-failures': 'Mix of successful and failed transactions',
      'recovery-flow': 'Failed transaction retry and recovery'
    };
    return descriptions[name] || 'No description available';
  }
}

module.exports = new TransactionSimulator();