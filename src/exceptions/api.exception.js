/**
 * Base API Exception class for consistent error handling
 */
class ApiException extends Error {
  constructor(message, statusCode = 500, errors = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestException extends ApiException {
  constructor(message = 'Bad Request', errors = null) {
    super(message, 400, errors);
  }
}

class UnauthorizedException extends ApiException {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class AuthenticationError extends UnauthorizedException {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class ForbiddenException extends ApiException {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class NotFoundException extends ApiException {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

module.exports = {
  ApiException,
  BadRequestException,
  AuthenticationError,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException
};
