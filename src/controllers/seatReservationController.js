const crypto = require('crypto');
const { realtimeDatabase } = require('../config/firebase');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} = require('../utils/apiError');
const {
  upsertRiderRecord,
  getRiderRecord,
  deleteRiderRecord,
} = require('../services/firestoreRiderRecordService');

const firebaseUid = (req) => req.user?.firebase_uid || req.user?.id;

const getRealtimeDatabase = () => {
  if (!realtimeDatabase) {
    throw new ServiceUnavailableError('Firebase Realtime Database is not configured');
  }
  return realtimeDatabase;
};

const clearReservation = async (db, tripId, seatNumber, reservationId) => {
  const seatReference = db.ref(`trip_seats/${tripId}/${seatNumber}`);
  await seatReference.transaction((current) => (
    current?.reservationId === reservationId ? null : undefined
  ));
  await db.ref(`seat_reservations/${reservationId}`).remove();
};

exports.hold = asyncHandler(async (req, res) => {
  const { tripId, seatNumber } = req.body;
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(String(seatNumber || ''))) {
    throw new BadRequestError('seatNumber must contain only letters, numbers, underscores, or hyphens');
  }

  const db = getRealtimeDatabase();
  const userId = firebaseUid(req);
  const booking = await getRiderRecord(userId, 'booking', tripId);
  if (!booking) throw new NotFoundError('Trip');
  const reservationId = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const seatReservation = {
    reservationId,
    userId,
    riderId: userId,
    tripId,
    seatNumber: String(seatNumber),
    status: 'held',
    expiresAt,
  };
  const seatReference = db.ref(`trip_seats/${tripId}/${seatNumber}`);
  const transaction = await seatReference.transaction((current) => {
    if (current?.status === 'confirmed') return undefined;
    if (current?.status === 'held' && Number(current.expiresAt) > Date.now()) return undefined;
    return seatReservation;
  });

  if (!transaction.committed) {
    throw new ConflictError('That seat is already reserved');
  }

  try {
    const record = await upsertRiderRecord({
      firebaseUid: userId,
      id: reservationId,
      recordType: 'seat_reservation',
      status: 'held',
      payload: seatReservation,
    });
    await db.ref(`seat_reservations/${reservationId}`).set(seatReservation);
    return sendResponse(res, 201, {
      id: record.id,
      ...record.payload,
    }, 'Seat held');
  } catch (error) {
    try {
      await clearReservation(db, tripId, String(seatNumber), reservationId);
    } catch (cleanupError) {
      console.error('Failed to release seat after reservation creation failed', {
        reservationId,
        error: cleanupError.message,
      });
    }
    try {
      await deleteRiderRecord(userId, 'seat_reservation', reservationId);
    } catch (cleanupError) {
      console.error('Failed to tombstone an incomplete seat reservation', {
        reservationId,
        error: cleanupError.message,
      });
    }
    throw error;
  }
});

exports.confirm = asyncHandler(async (req, res) => {
  const userId = firebaseUid(req);
  const record = await getRiderRecord(userId, 'seat_reservation', req.params.id);
  if (!record) throw new NotFoundError('Seat reservation');
  if (record.status !== 'held' || Number(record.payload.expiresAt) <= Date.now()) {
    throw new ConflictError('Seat reservation has expired');
  }

  const updated = await upsertRiderRecord({
    firebaseUid: userId,
    id: record.id,
    recordType: 'seat_reservation',
    status: 'confirmed',
    payload: { ...record.payload, status: 'confirmed', confirmedAt: new Date().toISOString() },
  });
  const db = getRealtimeDatabase();
  await db.ref(`trip_seats/${record.payload.tripId}/${record.payload.seatNumber}`)
    .update({ status: 'confirmed' });
  await db.ref(`seat_reservations/${record.id}`).remove();

  return sendResponse(res, 200, { id: updated.id, ...updated.payload }, 'Seat reservation confirmed');
});

exports.release = asyncHandler(async (req, res) => {
  const userId = firebaseUid(req);
  const record = await getRiderRecord(userId, 'seat_reservation', req.params.id);
  if (!record) throw new NotFoundError('Seat reservation');

  const db = getRealtimeDatabase();
  await clearReservation(db, record.payload.tripId, record.payload.seatNumber, record.id);
  await upsertRiderRecord({
    firebaseUid: userId,
    id: record.id,
    recordType: 'seat_reservation',
    status: 'deleted',
    payload: record.payload,
  });
  return sendResponse(res, 200, null, 'Seat reservation released');
});

exports.getTripSeats = asyncHandler(async (req, res) => {
  const booking = await getRiderRecord(firebaseUid(req), 'booking', req.params.id);
  if (!booking) throw new NotFoundError('Trip');
  const snapshot = await getRealtimeDatabase()
    .ref(`trip_seats/${req.params.id}`)
    .once('value');
  return sendResponse(res, 200, snapshot.val() || {}, 'Trip seats retrieved');
});
