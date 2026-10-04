const { haversineKm } = require('./distanceCalculator');

/**
 * Basic fare calculation algorithm suitable for production with tunable params.
 * All amounts are returned in smallest currency unit (cents).
 */
function calculateFare({ distanceMeters = 0, durationSeconds = 0, surgeMultiplier = 1, baseFare = null, currency = 'USD' } = {}) {
	const cfg = {
		base_fare_cents: Number(process.env.FARE_BASE_CENTS || 200),
		per_km_cents: Number(process.env.FARE_PER_KM_CENTS || 100),
		per_min_cents: Number(process.env.FARE_PER_MIN_CENTS || 20),
		minimum_fare_cents: Number(process.env.FARE_MINIMUM_CENTS || 300),
	};

	const distanceKm = Math.max(0, distanceMeters / 1000);
	const minutes = Math.max(0, durationSeconds / 60);

	const base = baseFare !== null ? Number(baseFare) : cfg.base_fare_cents;
	const distanceComponent = Math.round(distanceKm * cfg.per_km_cents);
	const timeComponent = Math.round(minutes * cfg.per_min_cents);

	let fare = Math.round((base + distanceComponent + timeComponent) * Number(surgeMultiplier));
	if (fare < cfg.minimum_fare_cents) fare = cfg.minimum_fare_cents;

	return {
		amount_cents: fare,
		currency,
		breakdown: { base: base, distance: distanceComponent, time: timeComponent, surgeMultiplier },
	};
}

module.exports = { calculateFare };
