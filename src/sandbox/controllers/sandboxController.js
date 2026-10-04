/**
 * Sandbox Controller
 * Manages sandbox simulation endpoints
 * @module sandbox/controllers/sandboxController
 */

const mpesaSimulator = require('../simulators/mpesaSimulator');
const ecocashSimulator = require('../simulators/ecocashSimulator');
const transactionSimulator = require('../services/transactionSimulator');
const testDataGenerator = require('../services/testDataGenerator');
const logger = require('../../utils/logger');
const { ApiResponse } = require('../../utils/apiResponse');

class SandboxController {
  /**
   * Get simulation status
   */
  async getStatus(req, res) {
    const mpesaStats = mpesaSimulator.getStats();
    const ecocashStats = ecocashSimulator.getStats();
    
    res.json(new ApiResponse(200, {
      mpesa: mpesaStats,
      ecocash: ecocashStats,
      active: true,
      mode: process.env.SANDBOX_MODE || 'enabled'
    }, 'Sandbox status retrieved'));
  }

  /**
   * Configure simulation parameters
   */
  async configureSimulation(req, res) {
    const { provider, delay, failureRate } = req.body;
    
    if (provider === 'MPESA') {
      mpesaSimulator.setSimulationParams({ delay, failureRate });
    } else if (provider === 'ECOCASH') {
      ecocashSimulator.setSimulationParams({ delay, failureRate });
    } else if (provider === 'BOTH') {
      mpesaSimulator.setSimulationParams({ delay, failureRate });
      ecocashSimulator.setSimulationParams({ delay, failureRate });
    }
    
    res.json(new ApiResponse(200, {
      provider,
      delay,
      failureRate
    }, 'Simulation parameters updated'));
  }

  /**
   * Reset simulators
   */
  async resetSimulation(req, res) {
    const { provider } = req.body;
    
    if (provider === 'MPESA') {
      mpesaSimulator.reset();
    } else if (provider === 'ECOCASH') {
      ecocashSimulator.reset();
    } else if (provider === 'BOTH') {
      mpesaSimulator.reset();
      ecocashSimulator.reset();
    }
    
    res.json(new ApiResponse(200, { provider }, 'Simulators reset successfully'));
  }

  /**
   * Run transaction scenario
   */
  async runScenario(req, res) {
    const { scenario, provider, count = 1 } = req.body;
    
    const results = await transactionSimulator.runScenario(scenario, provider, count);
    
    res.json(new ApiResponse(200, results, `Scenario '${scenario}' completed`));
  }

  /**
   * Generate test data
   */
  async generateTestData(req, res) {
    const { type, count = 10 } = req.body;
    
    let data;
    switch (type) {
      case 'transactions':
        data = await testDataGenerator.generateTransactions(count);
        break;
      case 'users':
        data = await testDataGenerator.generateUsers(count);
        break;
      case 'both':
        data = {
          transactions: await testDataGenerator.generateTransactions(count),
          users: await testDataGenerator.generateUsers(count)
        };
        break;
      default:
        data = await testDataGenerator.generateTransactions(count);
    }
    
    res.json(new ApiResponse(200, data, `Generated ${count} ${type} records`));
  }

  /**
   * Get test accounts
   */
  async getTestAccounts(req, res) {
    const mpesaAccounts = Object.entries(mpesaSimulator.testAccounts.customer).map(([phone, data]) => ({
      provider: 'MPESA',
      phone,
      name: data.name,
      balance: data.balance,
      pin: data.pin
    }));
    
    const ecocashAccounts = Object.entries(ecocashSimulator.testAccounts.customers).map(([phone, data]) => ({
      provider: 'ECOCASH',
      phone,
      name: data.name,
      balance: data.balance,
      verified: data.verified
    }));
    
    res.json(new ApiResponse(200, {
      mpesa: mpesaAccounts,
      ecocash: ecocashAccounts
    }, 'Test accounts retrieved'));
  }

  /**
   * Simulate webhook delivery
   */
  async simulateWebhook(req, res) {
    const { transactionId, provider, event } = req.body;
    
    let result;
    if (provider === 'MPESA') {
      result = await mpesaSimulator.sendCallback(transactionId, { event });
    } else if (provider === 'ECOCASH') {
      // Trigger webhook simulation
      const transaction = ecocashSimulator.transactions.get(transactionId);
      if (transaction) {
        result = await ecocashSimulator.sendWebhook(transaction);
      } else {
        result = { error: 'Transaction not found' };
      }
    }
    
    res.json(new ApiResponse(200, result, 'Webhook simulation triggered'));
  }

  /**
   * Get transaction details
   */
  async getTransaction(req, res) {
    const { transactionId, provider } = req.params;
    
    let transaction;
    if (provider === 'MPESA') {
      transaction = mpesaSimulator.transactions.get(transactionId);
    } else if (provider === 'ECOCASH') {
      transaction = ecocashSimulator.transactions.get(transactionId);
    }
    
    if (!transaction) {
      return res.status(404).json(new ApiResponse(404, null, 'Transaction not found'));
    }
    
    res.json(new ApiResponse(200, transaction, 'Transaction retrieved'));
  }

  /**
   * List all transactions
   */
  async listTransactions(req, res) {
    const { provider, status, limit = 50, offset = 0 } = req.query;
    
    let transactions = [];
    
    if (provider === 'MPESA' || !provider) {
      const mpesaTxs = Array.from(mpesaSimulator.transactions.entries()).map(([id, tx]) => ({
        id,
        provider: 'MPESA',
        ...tx
      }));
      transactions.push(...mpesaTxs);
    }
    
    if (provider === 'ECOCASH' || !provider) {
      const ecocashTxs = Array.from(ecocashSimulator.transactions.entries()).map(([id, tx]) => ({
        id,
        provider: 'ECOCASH',
        ...tx
      }));
      transactions.push(...ecocashTxs);
    }
    
    // Filter by status
    if (status) {
      transactions = transactions.filter(tx => tx.status === status);
    }
    
    // Sort by date
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Paginate
    const paginated = transactions.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json(new ApiResponse(200, {
      transactions: paginated,
      total: transactions.length,
      offset: parseInt(offset),
      limit: parseInt(limit)
    }, 'Transactions retrieved'));
  }
}

module.exports = new SandboxController();