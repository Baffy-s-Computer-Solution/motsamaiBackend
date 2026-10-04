const { getRedis } = require('../config/redis');
const logger = require('../config/logger');

const DRIVER_LOCATION_KEY = (id) => `driver:${id}:location`;
const DRIVER_LOCATION_CHANNEL = 'driver:locations';

async function updateDriverLocation(driverId, { lat, lng, heading } = {}) {
	if (!driverId) throw new Error('driverId required');
	const redis = getRedis();
	if (!redis) throw new Error('Redis not configured');

	const payload = { driverId, lat: Number(lat), lng: Number(lng), heading: heading || null, ts: Date.now() };
	try {
		await redis.set(DRIVER_LOCATION_KEY(driverId), JSON.stringify(payload), 'EX', 60 * 5);
		await redis.publish(DRIVER_LOCATION_CHANNEL, JSON.stringify(payload));
		return payload;
	} catch (err) {
		logger.error('updateDriverLocation failed', { err: err.message });
		throw err;
	}
}

async function getDriverLocation(driverId) {
	const redis = getRedis();
	if (!redis) return null;
	const raw = await redis.get(DRIVER_LOCATION_KEY(driverId));
	if (!raw) return null;
	try { return JSON.parse(raw); } catch { return null; }
}

module.exports = { updateDriverLocation, getDriverLocation };
