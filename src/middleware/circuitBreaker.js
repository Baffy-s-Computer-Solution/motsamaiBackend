const { createBreaker } = require('../config/circuit-breaker');

// Wrap an async route handler with a circuit breaker
module.exports = (handler, options = {}) => {
	const breaker = createBreaker(async (req) => handler(req), options);
	return async (req, res, next) => {
		try {
			const result = await breaker.fire(req);
			// If handler returned something, assume it's a response object handled by handler
			if (result && !res.headersSent) res.json(result);
		} catch (err) {
			return next(err);
		}
	};
};
