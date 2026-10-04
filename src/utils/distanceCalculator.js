/** Haversine formula utilities */

function toRad(deg) {
	return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
	if (!a || !b) return 0;
	const R = 6371; // Earth radius km
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const sinDLat = Math.sin(dLat / 2);
	const sinDLon = Math.sin(dLon / 2);
	const aHarv = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
	const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
	return R * c;
}

function haversineMeters(a, b) {
	return Math.round(haversineKm(a, b) * 1000);
}

module.exports = { toRad, haversineKm, haversineMeters };

