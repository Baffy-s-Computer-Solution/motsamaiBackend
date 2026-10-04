class OpsError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'OpsError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = { OpsError };
