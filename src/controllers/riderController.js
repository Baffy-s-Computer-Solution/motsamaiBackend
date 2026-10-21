const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const { BadRequestError, NotFoundError } = require('../utils/apiError');
const {
  upsertRiderRecord,
  getRiderRecord,
  listRiderRecords,
  deleteRiderRecord,
} = require('../services/firestoreRiderRecordService');

const getFirebaseUid = (req) => req.user?.firebase_uid || req.user?.id;
const bookingStatuses = new Set(['requested', 'searching', 'accepted', 'arrived', 'picked_up', 'in_progress', 'completed', 'cancelled', 'scheduled']);
const toResponse = (record) => ({
  id: record.id,
  ...record.payload,
  status: record.status,
  createdAt: record.created_at,
  updatedAt: record.source_updated_at,
});

exports.getStats = asyncHandler(async (req, res) => {
  const records = await listRiderRecords(getFirebaseUid(req), 'booking');
  const completed = records.filter((record) => record.status === 'completed');
  const spent = completed.reduce((sum, record) => sum + (Number(record.payload.fare) || 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  return sendResponse(res, 200, {
    totalTrips: records.length,
    totalSpent: Number(spent.toFixed(2)),
    tripsThisMonth: records.filter((record) => new Date(record.created_at) >= monthStart).length,
    completionRate: records.length ? Number(((completed.length / records.length) * 100).toFixed(1)) : 0,
    averageRating: null,
    onTimeRate: null,
    memberSince: req.user?.created_at || req.user?.createdAt || null,
    walletBalance: null,
  }, 'Rider statistics retrieved');
});

exports.getRecentRides = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 5));
  const records = await listRiderRecords(getFirebaseUid(req), 'booking');
  const rides = records
    .filter((record) => ['completed', 'cancelled'].includes(record.status))
    .slice(0, limit)
    .map(toResponse);
  return sendResponse(res, 200, rides, 'Recent rider trips retrieved');
});

exports.getUpcomingRides = asyncHandler(async (req, res) => {
  const records = await listRiderRecords(getFirebaseUid(req), 'booking');
  const rides = records
    .filter((record) => record.status === 'scheduled')
    .map(toResponse);
  return sendResponse(res, 200, rides, 'Upcoming rider trips retrieved');
});

exports.getActiveTrip = asyncHandler(async (req, res) => {
  const records = await listRiderRecords(getFirebaseUid(req), 'booking');
  const active = records.find((record) => bookingStatuses.has(record.status)
    && ['searching', 'accepted', 'arrived', 'picked_up', 'in_progress'].includes(record.status));
  return sendResponse(res, 200, active ? toResponse(active) : null, 'Active rider trip retrieved');
});

exports.getSavedRoutes = asyncHandler(async (req, res) => {
  const records = await listRiderRecords(getFirebaseUid(req), 'saved_route');
  return sendResponse(res, 200, records.map(toResponse), 'Saved routes retrieved');
});

exports.saveRoute = asyncHandler(async (req, res) => {
  if (!req.body.routeId && !req.body.id) throw new BadRequestError('routeId is required');
  const record = await upsertRiderRecord({
    firebaseUid: getFirebaseUid(req),
    id: req.body.savedRouteId || crypto.randomUUID(),
    recordType: 'saved_route',
    payload: {
      ...req.body,
      routeId: req.body.routeId || req.body.id,
    },
  });
  return sendResponse(res, 201, toResponse(record), 'Route saved');
});

exports.deleteSavedRoute = asyncHandler(async (req, res) => {
  const deleted = await deleteRiderRecord(getFirebaseUid(req), 'saved_route', req.params.id);
  if (!deleted) throw new NotFoundError('Saved route');
  return sendResponse(res, 200, null, 'Saved route deleted');
});

exports.rateTrip = asyncHandler(async (req, res) => {
  const firebaseUid = getFirebaseUid(req);
  const booking = await getRiderRecord(firebaseUid, 'booking', req.params.id);
  if (!booking) throw new NotFoundError('Booking');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new BadRequestError('rating must be an integer from 1 to 5');
  }

  const record = await upsertRiderRecord({
    firebaseUid,
    recordType: 'trip_rating',
    payload: {
      bookingId: booking.id,
      rating,
      comment: String(req.body.comment || '').trim(),
      createdAt: new Date().toISOString(),
    },
  });
  return sendResponse(res, 201, { id: record.id, bookingId: booking.id }, 'Trip rated');
});
