const { User, Ride } = require('../models');
const csvStringify = require('csv-stringify/sync');

exports.exportUsers = async (req, res, next) => {
	try {
		const users = await User.findAll({ attributes: ['id', 'name', 'email', 'phone', 'role', 'status'] });
		const data = users.map((u) => u.get({ plain: true }));
		const csv = csvStringify(data, { header: true });
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
		return res.send(csv);
	} catch (err) {
		return next(err);
	}
};

exports.exportRides = async (req, res, next) => {
	try {
		const rides = await Ride.findAll({ attributes: ['id', 'rider_id', 'driver_id', 'pickup_address', 'dropoff_address', 'status', 'fare_amount'] });
		const data = rides.map((r) => r.get({ plain: true }));
		const csv = csvStringify(data, { header: true });
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename=rides.csv');
		return res.send(csv);
	} catch (err) {
		return next(err);
	}
};
