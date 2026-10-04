/**
 * Transaction Idempotency Utility
 * Prevents duplicate transactions using Redis
 * @module utils/transactionIdempotency
 */

const redisClient = require('../config/redis');
const logger = require('./logger');

class IdempotencyManager {
  constructor() {
    this.defaultTTL = 86400; // 24 hours in seconds
  }

  /**
   * Check if transaction key already exists
   */
  async check(key) {
    try {
      const exists = await redisClient.get(`idempotency:${key}`);
      return exists !== null;
    } catch (error) {
      logger.error('Idempotency check failed:', error);
      return false; // Fail open - allow transaction on Redis failure
    }
  }

  /**
   * Record transaction key
   */
  async record(key, ttl = this.defaultTTL) {
    try {
      await redisClient.setex(`idempotency:${key}`, ttl, Date.now().toString());
      return true;
    } catch (error) {
      logger.error('Failed to record idempotency key:', error);
      return false;
    }
  }

  /**
   * Generate idempotency key from request
   */
  generateKey(prefix, identifier) {
    return `${prefix}:${identifier}:${Date.now()}`;
  }

  /**
   * Clean up old keys (optional maintenance)
   */
  async cleanup() {
    // Redis TTL handles cleanup automatically
    logger.info('Idempotency keys managed by Redis TTL');
  }
}

module.exports = new IdempotencyManager();