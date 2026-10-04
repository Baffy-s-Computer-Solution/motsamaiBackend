const logger = require('../utils/logger');
const { httpRequestDurationMicroseconds, httpRequestsTotal } = require('../utils/metrics');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]({
      message: `${req.method} ${req.originalUrl}`,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    
    httpRequestDurationMicroseconds
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .inc();
  });
  
  next();
};

const performanceLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn(`Slow request detected: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
  });
  next();
};

module.exports = { requestLogger, performanceLogger };