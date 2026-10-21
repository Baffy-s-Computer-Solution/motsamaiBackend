const mockDocuments = new Map();
const mockRecordUpsert = jest.fn();
const mockRecordDestroy = jest.fn();
const mockSupabaseSync = jest.fn();
const mockFirebaseRealtimeSync = jest.fn();
const mockIsDatabaseUnavailable = jest.fn((error) => error?.name === 'SequelizeConnectionRefusedError');
const mockLogger = { warn: jest.fn(), error: jest.fn() };

const mockDb = {
  collection: jest.fn((collectionName) => ({
    doc: jest.fn((id) => ({ id: `${collectionName}/${String(id)}` })),
  })),
  runTransaction: jest.fn(async (callback) => callback({
    get: async (document) => {
      const data = mockDocuments.get(document.id);
      return { exists: Boolean(data), data: () => data };
    },
    set: (document, data) => mockDocuments.set(document.id, data),
    update: (document, data) => {
      mockDocuments.set(document.id, { ...mockDocuments.get(document.id), ...data });
    },
    delete: (document) => mockDocuments.delete(document.id),
  })),
};

jest.mock('../../src/config/firebase', () => ({
  admin: { firestore: jest.fn(() => mockDb) },
  firestoreFirebaseApp: {},
  isFirestoreFirebaseEnabled: true,
}));

jest.mock('../../src/models', () => ({
  RiderRecord: {
    upsert: mockRecordUpsert,
    destroy: mockRecordDestroy,
  },
}));

jest.mock('../../src/services/supabaseRiderRealtimeService', () => ({
  syncBookingToSupabase: mockSupabaseSync,
}));

jest.mock('../../src/services/firebaseRiderRealtimeService', () => ({
  syncBookingToRealtimeDatabase: mockFirebaseRealtimeSync,
}));

jest.mock('../../src/utils/isDatabaseUnavailable', () => mockIsDatabaseUnavailable);
jest.mock('../../src/utils/logger', () => mockLogger);

const { upsertRiderRecord } = require('../../src/services/firestoreRiderRecordService');

describe('Firestore rider-record persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments.clear();
    mockRecordUpsert.mockResolvedValue(undefined);
    mockRecordDestroy.mockResolvedValue(1);
    mockSupabaseSync.mockResolvedValue(true);
    mockFirebaseRealtimeSync.mockResolvedValue(true);
    mockIsDatabaseUnavailable.mockImplementation((error) => error?.name === 'SequelizeConnectionRefusedError');
  });

  it('writes Firestore first and mirrors a stable booking ID to PostgreSQL and Supabase', async () => {
    const record = await upsertRiderRecord({
      firebaseUid: 'rider-firebase-uid',
      id: 'booking-stable-id',
      recordType: 'booking',
      status: 'searching',
      payload: { fare: 42, serviceType: 'passenger_transport' },
    });

    expect(mockDocuments.get('rider_records/booking-stable-id')).toEqual(expect.objectContaining({
      id: 'booking-stable-id',
      firebase_uid: 'rider-firebase-uid',
      status: 'searching',
      sync_status: 'synced',
      supabase_sync_status: 'synced',
      firebase_realtime_sync_status: 'synced',
    }));
    expect(mockSupabaseSync).toHaveBeenCalledWith(expect.objectContaining({
      id: 'booking-stable-id',
      firebase_uid: 'rider-firebase-uid',
      payload: { fare: 42, serviceType: 'passenger_transport' },
    }));
    expect(mockRecordUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'booking-stable-id',
      firebase_uid: 'rider-firebase-uid',
    }));
    expect(record.id).toBe('booking-stable-id');
  });

  it('keeps Firestore records pending for PostgreSQL replay when PostgreSQL is unavailable', async () => {
    mockRecordUpsert.mockRejectedValue({
      name: 'SequelizeConnectionRefusedError',
      message: 'database down',
    });

    await upsertRiderRecord({
      firebaseUid: 'rider-firebase-uid',
      id: 'booking-pending-id',
      recordType: 'booking',
      status: 'searching',
      payload: { fare: 42 },
    });

    expect(mockDocuments.get('rider_records/booking-pending-id')).toEqual(expect.objectContaining({
      sync_status: 'pending',
      supabase_sync_status: 'synced',
    }));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Rider record remains queued in Firestore until PostgreSQL is available',
      expect.objectContaining({ recordId: 'booking-pending-id' }),
    );
  });

  it('refuses to replace another rider’s Firestore record ID', async () => {
    mockDocuments.set('rider_records/shared-id', {
      id: 'shared-id',
      firebase_uid: 'another-rider',
      record_type: 'booking',
    });

    await expect(upsertRiderRecord({
      firebaseUid: 'rider-firebase-uid',
      id: 'shared-id',
      recordType: 'booking',
      payload: { fare: 42 },
    })).rejects.toThrow('does not belong to the authenticated user');
    expect(mockRecordUpsert).not.toHaveBeenCalled();
  });
});
