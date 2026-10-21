const { realtimeDatabase } = require('../config/firebase');
const logger = require('../utils/logger');

const syncBookingToRealtimeDatabase = async (record) => {
  if (record.record_type !== 'booking') return true;
  if (!realtimeDatabase) {
    logger.warn('Firebase Realtime Database rider trip mirror is unavailable', {
      recordId: record.id,
    });
    return false;
  }

  const tripReference = realtimeDatabase.ref(`trips/${record.id}`);
  if (record.status === 'deleted') {
    await tripReference.remove();
    return true;
  }

  await tripReference.update({
    riderId: record.firebase_uid,
    status: record.status,
    pickup: record.payload.pickup || null,
    destination: record.payload.destination || null,
    fare: record.payload.fare ?? null,
    updatedAt: Date.now(),
  });
  return true;
};

module.exports = { syncBookingToRealtimeDatabase };
