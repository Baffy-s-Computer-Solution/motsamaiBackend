const ok = (res, data = null, message = 'Success', status = 200) =>
  res.status(status).json({ success: true, message, data });

class ApiResponse {
  constructor(statusCode = 200, data = null, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode < 400;
    this.message = message;
    this.data = data;
  }
}

module.exports = { ok, ApiResponse };
