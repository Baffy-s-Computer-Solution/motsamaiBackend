/**
 * Custom API Error classes for consistent error handling
 * @version 2.0.0
 */

class APIError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends APIError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends APIError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends APIError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends APIError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends APIError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class BadRequestError extends APIError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

class DatabaseError extends APIError {
  constructor(message = 'Database error', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

class ServiceUnavailableError extends APIError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

module.exports = {
  APIError,
  ApiError: APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BadRequestError,
  DatabaseError,
  ServiceUnavailableError,
};
