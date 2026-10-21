const mockDocuments = new Map();
const mockTransactionSet = jest.fn();
const mockTransactionDelete = jest.fn();
const mockTransactionUpdate = jest.fn();
const mockDatabase = {
  collection: jest.fn(() => ({
    doc: jest.fn((id) => ({ id: String(id) })),
    where: jest.fn((field, operator, value) => ({
      get: jest.fn(async () => {
        const docs = [...mockDocuments.entries()]
          .filter(([, data]) => operator !== '==' || data[field] === value)
          .map(([id, data]) => ({ id, data: () => data }));
        return { docs };
      }),
    })),
  })),
  runTransaction: jest.fn(async (callback) => callback({
    get: async (document) => {
      const data = mockDocuments.get(document.id);
      return { exists: Boolean(data), data: () => data };
    },
    set: (document, data, options) => {
      mockTransactionSet(document, data, options);
      mockDocuments.set(document.id, data);
    },
    update: (document, data) => {
      mockTransactionUpdate(document, data);
      mockDocuments.set(document.id, { ...mockDocuments.get(document.id), ...data });
    },
    delete: (document) => {
      mockTransactionDelete(document);
      mockDocuments.delete(document.id);
    },
  })),
};

jest.mock('../../src/config/firebase', () => ({
  admin: { firestore: jest.fn(() => mockDatabase) },
  firestoreFirebaseApp: {},
  isFirestoreFirebaseEnabled: true,
}));

const {
  getFirestoreSavedPlaces,
  getFirestoreSavedPlaceIds,
  saveFirestoreSavedPlace,
  deleteFirestoreSavedPlace,
} = require('../../src/services/firestoreUserService');

describe('Firestore saved places', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocuments.clear();
  });

  it('stores and reads a rider place under its authenticated Firebase UID', async () => {
    await saveFirestoreSavedPlace('rider-uid', {
      id: 'place-1',
      name: 'Home',
      latitude: -29.3,
      longitude: 27.5,
    });

    await expect(getFirestoreSavedPlaces('rider-uid')).resolves.toEqual([
      expect.objectContaining({
        id: 'place-1',
        firebase_uid: 'rider-uid',
        name: 'Home',
      }),
    ]);
    expect(mockTransactionSet).toHaveBeenCalled();
  });

  it('does not overwrite a saved place owned by a different Firebase user', async () => {
    mockDocuments.set('place-1', { firebase_uid: 'another-rider' });

    await expect(saveFirestoreSavedPlace('rider-uid', {
      id: 'place-1',
      name: 'Not mine',
    })).rejects.toThrow('does not belong to the authenticated user');
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('allows only the owner to delete a saved place', async () => {
    mockDocuments.set('place-1', { firebase_uid: 'another-rider' });

    await expect(deleteFirestoreSavedPlace('rider-uid', 'place-1'))
      .rejects.toThrow('does not belong to the authenticated user');
    expect(mockTransactionDelete).not.toHaveBeenCalled();
  });

  it('keeps a deletion tombstone so stale PostgreSQL data cannot restore the place', async () => {
    mockDocuments.set('place-1', {
      firebase_uid: 'rider-uid',
      name: 'Old place',
    });

    await deleteFirestoreSavedPlace('rider-uid', 'place-1');

    await expect(getFirestoreSavedPlaces('rider-uid')).resolves.toEqual([]);
    await expect(getFirestoreSavedPlaceIds('rider-uid')).resolves.toEqual(['place-1']);
    expect(mockTransactionUpdate).toHaveBeenCalledWith(
      { id: 'place-1' },
      expect.objectContaining({ deleted: true }),
    );
  });
});
