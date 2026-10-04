const CircuitBreaker = require('opossum');
const logger = require('./logger');

function createBreaker(fn, options = {}) {
	const opts = Object.assign({ timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30000 }, options);
	const breaker = new CircuitBreaker(fn, opts);
	breaker.fallback(() => {
		// default fallback returns a controlled error
		throw new Error('Service unavailable (fallback)');
	});
	breaker.on('open', () => logger.warn('Circuit breaker opened'));
	breaker.on('halfOpen', () => logger.info('Circuit breaker half-open'));
	breaker.on('close', () => logger.info('Circuit breaker closed'));
	return breaker;
}

module.exports = { createBreaker };
