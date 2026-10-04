const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * PaymentRateLimiter - Specialized rate limiting for financial transactions.
 * Uses a sliding window algorithm via Redis to prevent burst abuse.
 */
class PaymentRateLimiter {
  constructor() {
    // Redis is optional: retain the existing fail-open behavior when no cache is configured.
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      this.redis = null;
      logger.info('Payment rate limiter is running without Redis.');
      return;
    }

    // Initialize Redis connection specifically for rate limiting
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      keyPrefix: 'ratelimit:payment:',
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });

    this.redis.on('error', (err) => {
      logger.error('Redis Rate Limiter Error:', err);
    });

    this.redis.connect().catch((err) => {
      logger.error('PaymentRateLimiter Redis connection failed:', err);
      this.redis = null;
    });
  }

  /**
   * Lua script to perform atomic sliding window increments.
   * ARGV[1]: Current timestamp (ms)
   * ARGV[2]: Window size (ms)
   * ARGV[3]: Max requests allowed in window
   */
  async isRateLimited(key, limit, windowMs) {
    if (!this.redis) return 0;

    const now = Date.now();
    const windowStart = now - windowMs;

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      -- Remove elements older than the window
      redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

      -- Count current elements
      local currentCount = redis.call('ZCARD', key)

      if currentCount < limit then
        -- Add the current request
        redis.call('ZADD', key, now, now)
        -- Set expiration to clean up key after window
        redis.call('PEXPIRE', key, tonumber(ARGV[2]))
        return 0
      else
        return 1
      end
    `;

    try {
      return await this.redis.eval(script, 1, key, now, windowStart, limit);
    } catch (error) {
      logger.error('Rate Limiter script execution failed:', error);
      // Fail open in production to ensure payments aren't blocked by infrastructure failure
      return 0;
    }
  }

  /**
   * Middleware generator for specific payment actions.
   * @param {string} action - e.g., 'withdrawal', 'add_card'
   * @param {number} limit - Max requests
   * @param {number} windowMinutes - Time window
   */
  limit(action, limit, windowMinutes) {
    const windowMs = windowMinutes * 60 * 1000;

    return async (req, res, next) => {
      // Identify user by ID (auth) or IP (anonymous)
      const identifier = req.user ? req.user.id : req.ip;
      const key = `${action}:${identifier}`;

      const limited = await this.isRateLimited(key, limit, windowMs);

      if (limited) {
        logger.warn(`Rate limit exceeded for ${action} by ${identifier}`);
        return res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many ${action} attempts. Please try again in ${windowMinutes} minutes.`,
          retryAfter: windowMs / 1000
        });
      }

      next();
    };
  }
}

module.exports = new PaymentRateLimiter();