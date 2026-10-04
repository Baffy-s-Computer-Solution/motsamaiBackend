const axios = require('axios');
const { withRetry } = require('../config/retry-policies');
const { createBreaker } = require('../config/circuit-breaker');
const logger = require('../config/logger');

async function rawRequest(opts) {
	const { method = 'get', url, data, headers = {}, timeout = 5000 } = opts;
	if (!url) throw new Error('url required');
	try {
		const res = await axios({ method, url, data, headers, timeout });
		return res.data;
	} catch (err) {
		logger.error('Third-party HTTP request failed', { url, err: err.message });
		throw err;
	}
}

const safeRequest = withRetry(rawRequest, { retries: 3, minTimeout: 200 });
const breaker = createBreaker(safeRequest, { timeout: 10000, errorThresholdPercentage: 60, resetTimeout: 30000 });

async function callWebhook(url, payload) {
	try {
		return await breaker({ method: 'post', url, data: payload, headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		logger.error('callWebhook failed', { url, err: err.message });
		throw err;
	}
}

module.exports = { rawRequest, safeRequest, callWebhook };
