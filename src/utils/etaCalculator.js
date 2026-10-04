const { haversineKm } = require('./distanceCalculator');

/**
 * Estimate trip ETA (seconds) from two points using a simple average-speed model.
 * avgSpeedKph may be tuned per city / traffic conditions.
 */
function estimateEtaSeconds(origin, destination, avgSpeedKph = 30) {
	if (!origin || !destination) return null;
	const km = haversineKm(origin, destination);
	const hours = km / Math.max(1, avgSpeedKph);
	return Math.round(hours * 3600);
}

module.exports = { estimateEtaSeconds };
