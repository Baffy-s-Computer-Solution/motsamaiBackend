/**
 * Test Data Generator
 * Generates realistic test data for sandbox testing
 * @module sandbox/services/testDataGenerator
 */

const { faker } = require('@faker-js/faker');
const mpesaSimulator = require('../simulators/mpesaSimulator');
const ecocashSimulator = require('../simulators/ecocashSimulator');

class TestDataGenerator {
  constructor() {
    this.lesothoPhonePrefixes = ['2665', '2666'];
    this.amounts = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
  }

  /**
   * Generate random Lesotho phone number
   */
  generatePhoneNumber() {
    const prefix = this.lesothoPhonePrefixes[Math.floor(Math.random() * this.lesothoPhonePrefixes.length)];
    const suffix = Math.floor(Math.random() * 9000000) + 1000000;
    return `${prefix}${suffix}`;
  }

  /**
   * Generate random amount
   */
  generateAmount() {
    return this.amounts[Math.floor(Math.random() * this.amounts.length)];
  }

  /**
   * Generate random reference
   */
  generateReference() {
    return `REF_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Generate test transactions
   */
  async generateTransactions(count = 10) {
    const transactions = [];
    
    for (let i = 0; i < count; i++) {
      const provider = Math.random() > 0.5 ? 'MPESA' : 'ECOCASH';
      const amount = this.generateAmount();
      const phone = this.generatePhoneNumber();
      const statuses = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      transactions.push({
        id: `${provider}_${Date.now()}_${i}`,
        provider,
        amount,
        phone,
        status,
        reference: this.generateReference(),
        description: `Test transaction ${i + 1}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Add to simulator
      if (provider === 'MPESA') {
        const checkoutRequestId = `SANDBOX_${Date.now()}_${i}`;
        mpesaSimulator.transactions.set(checkoutRequestId, {
          checkoutRequestId,
          amount,
          phoneNumber: phone,
          accountReference: transactions[i].reference,
          description: transactions[i].description,
          status,
          createdAt: new Date(),
          simulator: true
        });
      } else {
        const transactionId = `EC_${Date.now()}_${i}`;
        ecocashSimulator.transactions.set(transactionId, {
          transactionId,
          amount,
          customerMsisdn: phone,
          merchantId: 'EASYGO001',
          reference: transactions[i].reference,
          description: transactions[i].description,
          status,
          createdAt: new Date(),
          simulator: true
        });
      }
    }
    
    return transactions;
  }

  /**
   * Generate test users
   */
  async generateUsers(count = 10) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      const user = {
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        phone: this.generatePhoneNumber(),
        role: Math.random() > 0.8 ? 'driver' : 'rider',
        balance: Math.floor(Math.random() * 50000),
        createdAt: faker.date.past(),
        verified: Math.random() > 0.2
      };
      
      users.push(user);
      
      // Add to test accounts if not exists
      if (!mpesaSimulator.testAccounts.customer[user.phone]) {
        mpesaSimulator.testAccounts.customer[user.phone] = {
          balance: user.balance,
          name: user.name,
          pin: '1234'
        };
      }
      
      if (!ecocashSimulator.testAccounts.customers[user.phone]) {
        ecocashSimulator.testAccounts.customers[user.phone] = {
          balance: user.balance,
          name: user.name,
          verified: user.verified
        };
      }
    }
    
    return users;
  }

  /**
   * Generate bulk payment batch
   */
  generateBulkPayments(count = 50) {
    const payments = [];
    
    for (let i = 0; i < count; i++) {
      payments.push({
        phone: this.generatePhoneNumber(),
        amount: this.generateAmount(),
        reference: this.generateReference(),
        description: `Bulk payment ${i + 1}`
      });
    }
    
    return payments;
  }

  /**
   * Generate transaction history for a user
   */
  generateUserHistory(userPhone, months = 3) {
    const transactions = [];
    const now = new Date();
    
    for (let m = 0; m < months; m++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() - m + 1, 0).getDate();
      
      // Generate 5-15 transactions per month
      const txCount = Math.floor(Math.random() * 10) + 5;
      
      for (let i = 0; i < txCount; i++) {
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        date.setHours(hour, minute);
        
        transactions.push({
          id: `TX_${date.getTime()}_${i}`,
          provider: Math.random() > 0.5 ? 'MPESA' : 'ECOCASH',
          amount: this.generateAmount(),
          phone: userPhone,
          status: Math.random() > 0.1 ? 'COMPLETED' : 'FAILED',
          reference: this.generateReference(),
          description: `Transaction on ${date.toLocaleDateString()}`,
          createdAt: date,
          type: Math.random() > 0.7 ? 'B2C' : 'C2B'
        });
      }
    }
    
    return transactions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Generate reports
   */
  generateReport(startDate, endDate) {
    const transactions = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
    for (let d = 0; d <= days; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + d);
      
      const mpesaCount = Math.floor(Math.random() * 100);
      const ecocashCount = Math.floor(Math.random() * 80);
      const mpesaVolume = mpesaCount * 150;
      const ecocashVolume = ecocashCount * 120;
      
      transactions.push({
        date: date.toISOString().split('T')[0],
        mpesa: {
          count: mpesaCount,
          volume: mpesaVolume,
          successRate: 0.95 - Math.random() * 0.1
        },
        ecocash: {
          count: ecocashCount,
          volume: ecocashVolume,
          successRate: 0.93 - Math.random() * 0.1
        },
        total: {
          count: mpesaCount + ecocashCount,
          volume: mpesaVolume + ecocashVolume
        }
      });
    }
    
    return {
      startDate: startDate,
      endDate: endDate,
      days: days + 1,
      summary: {
        totalTransactions: transactions.reduce((sum, d) => sum + d.total.count, 0),
        totalVolume: transactions.reduce((sum, d) => sum + d.total.volume, 0),
        averageDailyTransactions: transactions.reduce((sum, d) => sum + d.total.count, 0) / (days + 1),
        averageDailyVolume: transactions.reduce((sum, d) => sum + d.total.volume, 0) / (days + 1)
      },
      daily: transactions
    };
  }
}

module.exports = new TestDataGenerator();