const models = require('../models');
const { getRedis } = require('../config/redis');

exports.metrics = async (req, res, next) => {
	try {
		const [usersCount, driversCount, ridesCount, paymentsCount] = await Promise.all([
			models.User.count(),
			models.Driver.count(),
			models.Ride.count(),
			models.Payment.count(),
		]);

		const redis = getRedis();
		let activeDrivers = 0;
		try {
			if (redis) {
				const keys = await redis.keys('driver:*:location');
				activeDrivers = keys ? keys.length : 0;
			}
		} catch (e) {
			// ignore redis errors for metrics
			activeDrivers = 0;
		}

		return res.json({
			success: true,
			data: { users: usersCount, drivers: driversCount, rides: ridesCount, payments: paymentsCount, activeDrivers },
		});
	} catch (err) {
		return next(err);
	}
};
