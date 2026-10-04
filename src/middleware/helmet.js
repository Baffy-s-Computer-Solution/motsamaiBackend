const helmet = require('helmet');

const helmetConfig = helmet({
  contentSecurityPolicy: false, // Set to true and configure if you want strict CSP
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: parseInt(process.env.HSTS_MAX_AGE, 10) || 31536000,
    includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS === 'true',
    preload: process.env.HSTS_PRELOAD === 'true',
  },
});

module.exports = helmetConfig;
