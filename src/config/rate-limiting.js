const { apiLimiter, authLimiter } = require('../middleware/rateLimiter');

module.exports = {
  apiLimiter,
  authLimiter,
};
