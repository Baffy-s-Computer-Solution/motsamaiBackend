const logger = require('../utils/logger');
const config = require('../config');

/**
 * Global Error Handler Middleware
 * Standardizes error responses and ensures graceful failure.
 */
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Centralized logging with request context
  logger.error({
    message: err.message,
    stack: err.stack,
    requestId: req.requestId,
    correlationId: req.correlationId,
    path: req.originalUrl,
    method: req.method,
    userId: req.user ? req.user.id : 'anonymous'
  });

  // Standardized Error Response
  const errorResponse = {
    status: err.status,
    message: err.message,
    requestId: req.requestId
  };

  // Handle Joi Validation Errors specifically
  if (err.isJoi) {
    err.statusCode = 400;
    errorResponse.message = 'Validation Error';
    errorResponse.details = err.details.map(d => ({
      message: d.message,
      path: d.path
    }));
  }

  // Development Mode: Include stack trace and full error object
  if (config.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      ...errorResponse,
      error: err,
      stack: err.stack
    });
  }

  // Production Mode: Hide implementation details for security
  return res.status(err.statusCode).json({
    status: err.status,
    message: err.isOperational ? err.message : 'An internal server error occurred'
  });
};