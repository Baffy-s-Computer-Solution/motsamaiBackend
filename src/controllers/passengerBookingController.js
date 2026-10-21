const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/apiError');
const pricingService = require('../services/pricingService');
const {
  upsertRiderRecord,
  getRiderRecord,
} = require('../services/firestoreRiderRecordService');

const getFirebaseUid = (req) => req.user?.firebase_uid || req.user?.id;

const normalizeLocation = (location, label) => {
  const lat = Number(location?.lat ?? location?.latitude ?? location?.location?.lat);
  const lng = Number(location?.lng ?? location?.longitude ?? location?.location?.lng);
  const address = String(location?.address || location?.label || '').trim();
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new BadRequestError(`${label} must include valid latitude and longitude`);
  }
  if (!address) throw new BadRequestError(`${label} address is required`);
  return { lat, lng, address };
};

const haversineDistanceKm = (origin, destination) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.lat - origin.lat);
  const longitudeDelta = radians(destination.lng - origin.lng);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.lat))
    * Math.cos(radians(destination.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const calculateQuote = async (body) => {
  const pickup = normalizeLocation(body.pickup, 'Pickup');
  const destination = normalizeLocation(body.destination, 'Destination');
  const distanceKm = haversineDistanceKm(pickup, destination);
  const durationMin = Math.max(1, Math.ceil((distanceKm / 25) * 60));
  const price = await pricingService.calculateFare({
    pickup,
    dropoff: destination,
    distanceKm,
    durationMin,
    vehicleType: body.transportMode,
  });

  if (!Number.isFinite(Number(price?.totalFare))) {
    throw new BadRequestError('A fare quote could not be calculated for these locations');
  }

  return {
    total: Number(price.totalFare),
    currency: price.currency || 'LSL',
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedDuration: durationMin,
    breakdown: price.breakdown || null,
    zoneName: price.zoneName || null,
  };
};

const toBookingResponse = (record) => ({
  id: record.id,
  ...record.payload,
  status: record.status,
  createdAt: record.created_at,
  updatedAt: record.source_updated_at,
});

exports.quote = asyncHandler(async (req, res) => {
  const quote = await calculateQuote(req.body);
  return sendResponse(res, 200, quote, 'Fare quote calculated');
});

exports.create = asyncHandler(async (req, res) => {
  if (!['passenger_transport', 'logistics'].includes(req.body.serviceType)) {
    throw new BadRequestError('serviceType must be passenger_transport or logistics');
  }

  const quote = await calculateQuote(req.body);
  const id = crypto.randomUUID();
  const status = req.body.scheduledTime ? 'scheduled' : 'searching';
  const record = await upsertRiderRecord({
    firebaseUid: getFirebaseUid(req),
    id,
    recordType: 'booking',
    status,
    payload: {
      serviceType: req.body.serviceType,
      tripType: req.body.tripType || 'private_ride',
      transportMode: req.body.transportMode || 'taxi_4_plus_1',
      pickup: normalizeLocation(req.body.pickup, 'Pickup'),
      destination: normalizeLocation(req.body.destination, 'Destination'),
      passengerCount: Math.max(1, Number(req.body.passengerCount) || 1),
      seatsRequested: Math.max(1, Number(req.body.seatsRequested) || 1),
      scheduledTime: req.body.scheduledTime || null,
      paymentMethod: req.body.paymentMethod || 'cash',
      fare: quote.total,
      fareSnapshot: quote,
      currency: quote.currency,
      bookingRef: id.slice(0, 8).toUpperCase(),
    },
  });

  return sendResponse(res, 201, toBookingResponse(record), 'Booking created');
});

exports.getById = asyncHandler(async (req, res) => {
  const record = await getRiderRecord(getFirebaseUid(req), 'booking', req.params.id);
  if (!record) throw new NotFoundError('Booking');
  return sendResponse(res, 200, toBookingResponse(record), 'Booking retrieved');
});

exports.cancel = asyncHandler(async (req, res) => {
  const firebaseUid = getFirebaseUid(req);
  const record = await getRiderRecord(firebaseUid, 'booking', req.params.id);
  if (!record) throw new NotFoundError('Booking');
  if (!['scheduled', 'searching', 'requested', 'accepted'].includes(record.status)) {
    throw new ConflictError('This booking can no longer be cancelled');
  }

  const updated = await upsertRiderRecord({
    firebaseUid,
    id: record.id,
    recordType: 'booking',
    status: 'cancelled',
    payload: {
      ...record.payload,
      cancellationReason: String(req.body.reason || 'Rider cancelled'),
      cancelledAt: new Date().toISOString(),
    },
  });
  return sendResponse(res, 200, toBookingResponse(updated), 'Booking cancelled');
});

exports.confirmBoarding = asyncHandler(async (req, res) => {
  const firebaseUid = getFirebaseUid(req);
  const record = await getRiderRecord(firebaseUid, 'booking', req.params.id);
  if (!record) throw new NotFoundError('Booking');
  if (!['accepted', 'arrived'].includes(record.status)) {
    throw new ConflictError('Boarding can only be confirmed after a driver accepts the booking');
  }

  const updated = await upsertRiderRecord({
    firebaseUid,
    id: record.id,
    recordType: 'booking',
    status: 'in_progress',
    payload: { ...record.payload, boardedAt: new Date().toISOString() },
  });
  return sendResponse(res, 200, toBookingResponse(updated), 'Boarding confirmed');
});

exports.share = asyncHandler(async (req, res) => {
  const firebaseUid = getFirebaseUid(req);
  const booking = await getRiderRecord(firebaseUid, 'booking', req.params.id);
  if (!booking) throw new NotFoundError('Booking');
  const record = await upsertRiderRecord({
    firebaseUid,
    recordType: 'trip_share',
    payload: {
      bookingId: booking.id,
      contacts: Array.isArray(req.body.contacts) ? req.body.contacts : [],
      createdAt: new Date().toISOString(),
    },
  });
  return sendResponse(res, 201, { id: record.id, bookingId: booking.id }, 'Trip shared');
});

exports.report = asyncHandler(async (req, res) => {
  const firebaseUid = getFirebaseUid(req);
  const booking = await getRiderRecord(firebaseUid, 'booking', req.params.id);
  if (!booking) throw new NotFoundError('Booking');
  const description = String(req.body.description || req.body.message || '').trim();
  if (!description) throw new BadRequestError('A report description is required');

  const record = await upsertRiderRecord({
    firebaseUid,
    recordType: 'issue_report',
    payload: {
      bookingId: booking.id,
      category: req.body.category || 'other',
      description,
      createdAt: new Date().toISOString(),
    },
  });
  return sendResponse(res, 201, { id: record.id, bookingId: booking.id }, 'Issue reported');
});
