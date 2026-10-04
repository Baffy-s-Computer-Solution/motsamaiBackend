const Joi = require('joi');
const models = require('../models');
const adapters = require('../adapters');
const logger = require('../config/logger');

const schema = Joi.object({
	riderId: Joi.number().required(),
	pickup: Joi.object({ lat: Joi.number().required(), lng: Joi.number().required() }).required(),
	dropoff: Joi.object({ lat: Joi.number().required(), lng: Joi.number().required() }).required(),
	seats: Joi.number().min(1).max(6).default(1),
	paymentMethod: Joi.string().valid('card', 'cash').default('card'),
	promoCode: Joi.string().allow(null, ''),
});

async function bookRide(payload, opts = {}) {
	const { logger: optLogger, transaction: tx } = opts;
	const log = optLogger || logger;

	const { error, value } = schema.validate(payload, { abortEarly: false });
	if (error) {
		const err = new Error('Validation failed');
		err.details = error.details;
		throw err;
	}

	const { riderId, pickup, dropoff, seats, paymentMethod, promoCode } = value;

	// Minimal availability search: find any driver in the zone with status active
	// In production this should call a geospatial index or drivers service
	const availableDriver = await models.Driver.findOne({ where: { status: 'available' } });
	if (!availableDriver) {
		const err = new Error('No drivers available');
		err.code = 'NO_DRIVERS';
		throw err;
	}

	// Price calculation placeholder
	const estimatedFare = Math.max(150, Math.round(Math.random() * 300 + 200)); // cents

	// Create Ride within a transaction when provided
	const createOpts = tx ? { transaction: tx } : {};
	const ride = await models.Ride.create({
		rider_id: riderId,
		driver_id: availableDriver.id,
		pickup_lat: pickup.lat,
		pickup_lng: pickup.lng,
		dropoff_lat: dropoff.lat,
		dropoff_lng: dropoff.lng,
		seats,
		status: 'requested',
		estimated_fare: estimatedFare,
		payment_method: paymentMethod,
	}, createOpts);

	// Create payment placeholder
	try {
		if (paymentMethod === 'card') {
			const pi = await adapters.payment.createPaymentIntent({ amount: estimatedFare, currency: 'usd', metadata: { rideId: ride.id } });
			await models.Payment.create({
				ride_id: ride.id,
				user_id: riderId,
				amount: estimatedFare,
				currency: 'usd',
				status: 'pending',
				gateway_payment_intent: pi.id,
			}, createOpts);
		} else {
			await models.Payment.create({
				ride_id: ride.id,
				user_id: riderId,
				amount: estimatedFare,
				currency: 'usd',
				status: 'unpaid',
			}, createOpts);
		}
	} catch (e) {
		log.error('Payment creation failed', { err: e.message });
		// Rollback ride if transactional
		if (tx) throw e;
	}

	// Notify driver and rider asynchronously
	(async () => {
		try {
			const rider = await models.User.findByPk(riderId);
			const driverUser = await models.User.findByPk(availableDriver.user_id);
			if (rider && rider.phone) {
				adapters.sms.sendSms({ to: rider.phone, body: `Your ride with driver ${driverUser ? driverUser.name : availableDriver.id} is requested.` }).catch(() => {});
			}
			if (driverUser && driverUser.phone) {
				adapters.sms.sendSms({ to: driverUser.phone, body: `New ride request: pickup nearby.` }).catch(() => {});
			}
			adapters.email.send({ to: rider ? rider.email : null, subject: 'Ride requested', template: 'ride-requested', templateData: { rideId: ride.id } }).catch(() => {});
		} catch (err) {
			log.warn('Notification hooks failed', { err: err.message });
		}
	})();

	return {
		rideId: ride.id,
		driverId: availableDriver.id,
		estimatedFare,
		currency: 'usd',
		status: ride.status,
	};
}

module.exports = bookRide;
