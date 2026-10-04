const { ApiException } = require('../exceptions/api.exception');
const logger = require('../utils/logger'); // Assumes a logger exists

/**
 * Global error handling middleware for production
 */
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }

  // Production: Don't leak implementation details
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      errors: err.errors || undefined
    });
  }

  // Programming or unknown errors: log and send generic message
  console.error('ERROR 💥', err);
  
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!'
  });
};