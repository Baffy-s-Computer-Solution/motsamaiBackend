const { getClient } = require('../config/elasticsearch');
const logger = require('../config/logger');

const INDEX_RIDES = process.env.ES_INDEX_RIDES || 'rides';

function normalizeRide(ride) {
	return {
		id: ride.id,
		rider_id: ride.rider_id,
		driver_id: ride.driver_id,
		pickup_address: ride.pickup_address,
		dropoff_address: ride.dropoff_address,
		pickup_lat: Number(ride.pickup_lat || 0),
		pickup_lng: Number(ride.pickup_lng || 0),
		dropoff_lat: Number(ride.dropoff_lat || 0),
		dropoff_lng: Number(ride.dropoff_lng || 0),
		status: ride.status,
		fare_amount: Number(ride.fare_amount || 0),
	};
}

async function indexRide(ride) {
	const client = getClient();
	if (!client) throw new Error('Elasticsearch not configured');
	try {
		const body = normalizeRide(ride);
		return client.index({ index: INDEX_RIDES, id: String(ride.id), body });
	} catch (err) {
		logger.error('indexRide failed', { err: err.message });
		throw err;
	}
}

async function searchRides(query, opts = {}) {
	const client = getClient();
	if (!client) throw new Error('Elasticsearch not configured');
	const body = {
		query: {
			multi_match: {
				query: query || '',
				fields: ['pickup_address^2', 'dropoff_address', 'status'],
				fuzziness: 'AUTO',
			},
		},
	};
	try {
		const res = await client.search({ index: INDEX_RIDES, body, size: opts.size || 10 });
		return res.hits.hits.map((h) => h._source);
	} catch (err) {
		logger.error('searchRides failed', { err: err.message });
		throw err;
	}
}

module.exports = { indexRide, searchRides };
