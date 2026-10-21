const crypto = require('crypto');
const { admin, firestoreFirebaseApp, isFirestoreFirebaseEnabled } = require('../config/firebase');
const { RiderRecord } = require('../models');
const isDatabaseUnavailable = require('../utils/isDatabaseUnavailable');
const logger = require('../utils/logger');
const { syncBookingToSupabase } = require('./supabaseRiderRealtimeService');
const { syncBookingToRealtimeDatabase } = require('./firebaseRiderRealtimeService');

const COLLECTION = 'rider_records';
const DOMAIN_COLLECTIONS = {
  booking: 'bookings',
  seat_reservation: 'seat_reservations',
  saved_route: 'saved_routes',
  trip_share: 'trip_shares',
  issue_report: 'trip_reports',
  trip_rating: 'trip_ratings',
};

const firestore = () => {
  if (!isFirestoreFirebaseEnabled || !firestoreFirebaseApp) {
    throw new Error('Firestore rider-data storage is unavailable');
  }
  return admin.firestore(firestoreFirebaseApp);
};

const normalizeRecord = (document) => ({
  id: document.id,
  ...document.data(),
});

const writeDomainDocument = (transaction, record) => {
  const collectionName = DOMAIN_COLLECTIONS[record.record_type];
  if (!collectionName) return;

  const domainDocument = firestore().collection(collectionName).doc(record.id);
  const domainPayload = {
    ...record.payload,
    id: record.id,
    firebase_uid: record.firebase_uid,
    userId: record.firebase_uid,
    status: record.status,
    updatedAt: record.source_updated_at,
    createdAt: record.created_at,
    deleted: record.status === 'deleted',
  };
  transaction.set(domainDocument, domainPayload, { merge: true });

  if (record.record_type === 'booking') {
    const tripDocument = firestore().collection('trips').doc(record.id);
    transaction.set(tripDocument, domainPayload, { merge: true });
  }
};

const syncRecordToPostgres = async (record) => {
  const row = {
    id: record.id,
    firebase_uid: record.firebase_uid,
    record_type: record.record_type,
    status: record.status,
    payload: record.payload,
    sync_status: 'synced',
    source_updated_at: new Date(record.source_updated_at),
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.source_updated_at),
  };

  if (record.status === 'deleted') {
    await RiderRecord.destroy({
      where: {
        id: record.id,
        firebase_uid: record.firebase_uid,
        record_type: record.record_type,
      },
    });
  } else {
    await RiderRecord.upsert(row);
  }

  const document = firestore().collection(COLLECTION).doc(record.id);
  await firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    if (!snapshot.exists) return;
    const latest = snapshot.data();
    if (latest.source_updated_at === record.source_updated_at) {
      transaction.update(document, {
        sync_status: 'synced',
        postgres_synced_at: new Date().toISOString(),
      });
    }
  });
};

const syncRecordToSupabase = async (record) => {
  if (record.record_type !== 'booking') return true;
  try {
    const synced = await syncBookingToSupabase(record);
    const document = firestore().collection(COLLECTION).doc(record.id);
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      if (!snapshot.exists) return;
      const latest = snapshot.data();
      if (latest.source_updated_at === record.source_updated_at) {
        transaction.update(document, {
          supabase_sync_status: synced ? 'synced' : 'pending',
          supabase_synced_at: synced ? new Date().toISOString() : null,
        });
      }
    });
    return synced;
  } catch (error) {
    logger.error('Supabase rider realtime synchronization failed', {
      recordId: record.id,
      error: error.message,
    });
    return false;
  }
};

const syncRecordToRealtimeDatabase = async (record) => {
  if (record.record_type !== 'booking') return true;
  try {
    const synced = await syncBookingToRealtimeDatabase(record);
    const document = firestore().collection(COLLECTION).doc(record.id);
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      if (!snapshot.exists) return;
      const latest = snapshot.data();
      if (latest.source_updated_at === record.source_updated_at) {
        transaction.update(document, {
          firebase_realtime_sync_status: synced ? 'synced' : 'pending',
          firebase_realtime_synced_at: synced ? new Date().toISOString() : null,
        });
      }
    });
    return synced;
  } catch (error) {
    logger.error('Firebase Realtime Database rider trip synchronization failed', {
      recordId: record.id,
      error: error.message,
    });
    return false;
  }
};

const trySyncRecord = async (record) => {
  const firebaseRealtimeSynced = await syncRecordToRealtimeDatabase(record);
  const supabaseSynced = await syncRecordToSupabase(record);
  try {
    await syncRecordToPostgres(record);
    return { postgresSynced: true, supabaseSynced, firebaseRealtimeSynced };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    logger.warn('Rider record remains queued in Firestore until PostgreSQL is available', {
      recordId: record.id,
      recordType: record.record_type,
      error: error.message,
    });
    return { postgresSynced: false, supabaseSynced, firebaseRealtimeSynced };
  }
};

const upsertRiderRecord = async ({
  firebaseUid,
  id = crypto.randomUUID(),
  recordType,
  status = 'active',
  payload,
}) => {
  if (!firebaseUid || !recordType || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Firebase UID, record type, and object payload are required');
  }

  const db = firestore();
  const document = db.collection(COLLECTION).doc(String(id));
  const now = new Date().toISOString();
  const record = {
    id: String(id),
    firebase_uid: String(firebaseUid),
    record_type: String(recordType),
    status: String(status),
    payload,
    sync_status: 'pending',
    supabase_sync_status: recordType === 'booking' ? 'pending' : 'not_applicable',
    firebase_realtime_sync_status: recordType === 'booking' ? 'pending' : 'not_applicable',
    source_updated_at: now,
    created_at: now,
  };

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(document);
    if (snapshot.exists) {
      const existing = snapshot.data();
      if (existing.firebase_uid !== record.firebase_uid || existing.record_type !== record.record_type) {
        throw new Error('Rider record does not belong to the authenticated user or requested type');
      }
      record.created_at = existing.created_at || now;
      const previousUpdate = Date.parse(existing.source_updated_at);
      if (Number.isFinite(previousUpdate)) {
        record.source_updated_at = new Date(Math.max(Date.now(), previousUpdate + 1)).toISOString();
      }
    }
    transaction.set(document, record);
    writeDomainDocument(transaction, record);
  });

  await trySyncRecord(record);
  return record;
};

const getRiderRecord = async (firebaseUid, recordType, id) => {
  if (!firebaseUid || !recordType || !id) throw new Error('Firebase UID, record type, and ID are required');
  const snapshot = await firestore().collection(COLLECTION).doc(String(id)).get();
  if (!snapshot.exists) return null;
  const record = normalizeRecord(snapshot);
  if (record.firebase_uid !== String(firebaseUid) || record.record_type !== String(recordType)) {
    return null;
  }
  if (record.status === 'deleted') return null;
  await trySyncRecord(record);
  return record;
};

const listRiderRecords = async (firebaseUid, recordType) => {
  if (!firebaseUid || !recordType) throw new Error('Firebase UID and record type are required');
  const snapshot = await firestore()
    .collection(COLLECTION)
    .where('firebase_uid', '==', String(firebaseUid))
    .get();
  const records = snapshot.docs
    .map(normalizeRecord)
    .filter((record) => record.record_type === String(recordType))
    .filter((record) => record.status !== 'deleted')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  await Promise.all(records.map(trySyncRecord));
  return records;
};

const deleteRiderRecord = async (firebaseUid, recordType, id) => {
  const existing = await getRiderRecord(firebaseUid, recordType, id);
  if (!existing) return false;
  await upsertRiderRecord({
    firebaseUid,
    id,
    recordType,
    status: 'deleted',
    payload: existing.payload,
  });
  return true;
};

const syncPendingRiderRecords = async (batchSize = 100) => {
  const db = firestore();
  const [postgresPending, supabasePending, firebaseRealtimePending] = await Promise.all([
    db.collection(COLLECTION).where('sync_status', '==', 'pending').limit(batchSize).get(),
    db.collection(COLLECTION).where('supabase_sync_status', '==', 'pending').limit(batchSize).get(),
    db.collection(COLLECTION).where('firebase_realtime_sync_status', '==', 'pending').limit(batchSize).get(),
  ]);
  const pendingRecords = new Map();
  [...postgresPending.docs, ...supabasePending.docs, ...firebaseRealtimePending.docs].forEach((document) => {
    pendingRecords.set(document.id, normalizeRecord(document));
  });
  let synced = 0;

  for (const record of pendingRecords.values()) {
    const firebaseRealtimeSynced = await syncRecordToRealtimeDatabase(record);
    const supabaseSynced = await syncRecordToSupabase(record);
    let postgresSynced = record.sync_status !== 'pending';
    try {
      if (!postgresSynced) {
        await syncRecordToPostgres(record);
        postgresSynced = true;
      }
      if (postgresSynced && supabaseSynced && firebaseRealtimeSynced) synced += 1;
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        logger.warn('Rider-record PostgreSQL synchronization paused because PostgreSQL is unavailable', {
          recordId: record.id,
          error: error.message,
        });
        break;
      }
      throw error;
    }
  }

  return { scanned: pendingRecords.size, synced };
};

module.exports = {
  upsertRiderRecord,
  getRiderRecord,
  listRiderRecords,
  deleteRiderRecord,
  syncPendingRiderRecords,
};
