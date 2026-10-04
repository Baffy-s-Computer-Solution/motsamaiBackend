const { haversineKm } = require('./distanceCalculator');

function bboxFromPoint({ lat, lng }, radiusKm = 5) {
	// approximate bbox in degrees
	const latDelta = radiusKm / 111; // ~111 km per degree lat
	const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
	return {
		minLat: lat - latDelta,
		maxLat: lat + latDelta,
		minLng: lng - lngDelta,
		maxLng: lng + lngDelta,
	};
}

function isWithinRadius(a, b, radiusKm) {
	const d = haversineKm(a, b);
	return d <= radiusKm;
}

module.exports = { bboxFromPoint, isWithinRadius };
