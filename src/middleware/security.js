const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const xss = require('xss-clean');

// Named middleware that can be used directly in routes
const securityHeaders = (req, res, next) => {
  // Apply selected helmet protections for route-level usage
  helmet({
    contentSecurityPolicy: false,
  })(req, res, () => {});

  // Minimal XSS and param pollution protections for request-level
  // (these are typically used as app-level middleware; for route-level
  // we keep them lightweight)
  xss()(req, res, () => {});
  hpp()(req, res, () => {});

  next();
};

// Full application-level security middleware (keeps backward compatibility)
const securityMiddleware = (app) => {
  // Set security HTTP headers (OWASP)
  app.use(helmet());

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp());

  // Rate limiting (Brute force protection)
  app.use('/api/v1/auth', rateLimit({
    max: 10,
    windowMs: 15 * 60 * 1000,
    message: 'Too many login attempts, please try again in 15 minutes'
  }));
};

module.exports = { securityHeaders, securityMiddleware };
