const { defaultCacheClient } = require('../config/cache-strategies');
const logger = require('../config/logger');

const cacheMiddleware = ({ ttl = 60 } = {}) => {
	const cache = defaultCacheClient();
	return async (req, res, next) => {
		if (!cache) return next();
		const key = `cache:${req.method}:${req.originalUrl}`;
		try {
			const cached = await cache.get(key);
			if (cached) {
				return res.json({ success: true, data: cached, cached: true });
			}
		} catch (e) {
			logger.warn('Cache get failed', { err: e.message });
		}

		const originalSend = res.json.bind(res);
		res.json = (payload) => {
			try {
				cache.set(key, payload.data || payload, ttl);
			} catch (e) {
				logger.warn('Cache set failed', { err: e.message });
			}
			return originalSend(payload);
		};
		return next();
	};
};

const invalidateCache = (pattern) => (req, res, next) => {
	const cache = defaultCacheClient();
	if (cache && typeof cache.del === 'function') {
		Promise.resolve(cache.del(pattern)).catch((error) => {
			logger.warn('Cache invalidation failed', { err: error.message, pattern });
		});
	}
	next();
};

module.exports = cacheMiddleware;
module.exports.cacheMiddleware = cacheMiddleware;
module.exports.invalidateCache = invalidateCache;

