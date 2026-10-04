const rateLimit = require('express-rate-limit');

// Generic factory for creating rate limiters with sensible defaults
const rateLimiter = (opts = {}) => {
  const windowMs = opts.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
  const max = opts.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500;
  const message = opts.message || { success: false, message: 'Too many requests, please try again later.' };

  return rateLimit({
    windowMs,
    max,
    message,
    keyGenerator: opts.keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    skip: opts.skip,
    headers: opts.headers,
    // allow overriding any other options via opts
    ...opts
  });
};

// Preconfigured limiters used in multiple places
const apiLimiter = rateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
});

const authLimiter = rateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10) || 100,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' }
});

const webhookRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 60,
});

module.exports = { rateLimiter, apiLimiter, authLimiter, webhookRateLimiter };
