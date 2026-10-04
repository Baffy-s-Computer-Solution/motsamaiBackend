const { Wallet, Transaction, sequelize } = require('../models');
const logger = require('../utils/logger');

/**
 * WalletService - Handles internal balance updates and transaction history
 */
class WalletService {
  /**
   * Updates a user's wallet balance and records the transaction
   * @param {string} userId - ID of the user
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   * @param {string} type - Transaction type ('credit' or 'debit')
   * @param {string} description - Purpose of the transaction
   * @param {string} referenceId - Associated entity ID (e.g., Ride ID or Payment ID)
   */
  async updateBalance(userId, amount, type, description, referenceId = null) {
    const t = await sequelize.transaction();
    
    try {
      // Find or create wallet for the user
      const [wallet] = await Wallet.findOrCreate({
        where: { user_id: userId },
        defaults: { balance: 0 },
        transaction: t
      });

      const currentBalance = parseFloat(wallet.balance);
      const newBalance = currentBalance + parseFloat(amount);

      // Update balance
      await wallet.update({ balance: newBalance }, { transaction: t });

      // Record transaction
      await Transaction.create({
        wallet_id: wallet.id,
        amount: Math.abs(amount),
        type,
        description,
        reference_id: referenceId,
        status: 'completed',
        timestamp: new Date()
      }, { transaction: t });

      await t.commit();
      logger.info(`Wallet balance updated for User: ${userId}. New Balance: ${newBalance}`);
      
      return { wallet, newBalance };
    } catch (error) {
      await t.rollback();
      logger.error(`Failed to update wallet balance for User: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Fetches paginated transaction history for a user
   * @param {string} userId - ID of the user
   * @param {Object} options - Pagination options { page, limit }
   */
  async getTransactionHistory(userId, { page = 1, limit = 20 } = {}) {
    try {
      const wallet = await Wallet.findOne({ where: { user_id: userId } });
      if (!wallet) {
        return { transactions: [], count: 0, page, limit };
      }

      const offset = (page - 1) * limit;
      const { count, rows } = await Transaction.findAndCountAll({
        where: { wallet_id: wallet.id },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['timestamp', 'DESC']]
      });

      return { transactions: rows, count, page, limit };
    } catch (error) {
      logger.error(`Failed to fetch transaction history for User: ${userId}`, error);
      throw error;
    }
  }
}

module.exports = new WalletService();