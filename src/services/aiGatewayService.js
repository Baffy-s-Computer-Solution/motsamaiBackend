const axios = require('axios');

const timeout = Number(process.env.AI_SERVICE_TIMEOUT || 10000);
const baseUrl = String(process.env.AI_SERVICE_URL || '').replace(/\/$/, '');

const requestAI = async (path, payload, requestId) => {
  if (!baseUrl) {
    const error = new Error('AI service is not configured');
    error.code = 'AI_SERVICE_NOT_CONFIGURED';
    error.statusCode = 503;
    throw error;
  }

  const response = await axios.post(`${baseUrl}${path}`, { payload }, {
    timeout,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.AI_SERVICE_API_KEY ? { 'X-AI-Service-Key': process.env.AI_SERVICE_API_KEY } : {}),
      ...(requestId ? { 'X-Request-ID': requestId } : {}),
    },
  });
  return response.data;
};

module.exports = { requestAI };
