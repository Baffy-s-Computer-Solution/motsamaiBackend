const crypto = require('crypto');
const { getRedis } = require('../config/redis');
const logger = require('../config/logger');

function generateNumeric(length = 6) {
	const max = 10 ** length;
	const num = crypto.randomInt(Math.floor(max / 10), max);
	return String(num).padStart(length, '0');
}

async function storeOtp(key, code, ttlSec = 600) {
	const redis = getRedis();
	if (!redis) {
		logger.warn('Redis not configured; OTP will not be persisted');
		return null;
	}
	await redis.set(`otp:${key}`, code, 'EX', ttlSec);
	return true;
}

async function verifyOtp(key, code) {
	const redis = getRedis();
	if (!redis) return false;
	const stored = await redis.get(`otp:${key}`);
	if (!stored) return false;
	if (stored === String(code)) {
		await redis.del(`otp:${key}`);
		return true;
	}
	return false;
}

module.exports = { generateNumeric, storeOtp, verifyOtp };
