const logger = require('./logger');
const { redisClient } = require('./redis');
let warnedNoRedis = false;

function getRedis() {
	return redisClient && redisClient.isOpen ? redisClient : null;
}

function defaultCacheClient() {
	const redis = getRedis();
	if (!redis) {
		if (!warnedNoRedis) {
			logger.warn('Redis not available, cache strategies will be no-op');
			warnedNoRedis = true;
		}
		return {
			get: async () => null,
			set: async () => null,
			del: async () => null,
		};
	}
	return {
		get: async (key) => {
			const v = await redis.get(key);
			try { return JSON.parse(v); } catch (_) { return v; }
		},
		set: async (key, value, ttlSec) => {
			const v = typeof value === 'string' ? value : JSON.stringify(value);
			if (ttlSec) return redis.set(key, v, 'EX', Number(ttlSec));
			return redis.set(key, v);
		},
		del: async (key) => redis.del(key),
	};
}

module.exports = { defaultCacheClient, getRedis };
