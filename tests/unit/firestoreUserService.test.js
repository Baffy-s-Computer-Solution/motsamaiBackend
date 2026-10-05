const mockSet = jest.fn().mockResolvedValue(undefined);
const mockDocGet = jest.fn();
const mockEmailQueryGet = jest.fn();
const mockDocRef = {
  set: mockSet,
  get: mockDocGet,
  collection: jest.fn(() => ({ doc: jest.fn(() => mockDocRef) })),
};
const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => mockDocRef),
    where: jest.fn(() => ({
      limit: jest.fn(() => ({ get: mockEmailQueryGet })),
    })),
  })),
};
const mockAdmin = {
  firestore: Object.assign(jest.fn(() => mockFirestore), {
    FieldValue: { serverTimestamp: jest.fn(() => 'server-timestamp') },
  }),
};

jest.mock('../../src/config/firebase', () => ({
  admin: mockAdmin,
  authFirebaseApp: {},
  firestoreFirebaseApp: {},
  isAuthFirebaseEnabled: true,
  isFirestoreFirebaseEnabled: true,
}));

const {
  getFirestoreUserByEmail,
  getFirestoreUserByUid,
  persistFirebaseUserProfile,
} = require('../../src/services/firestoreUserService');

describe('Firestore user profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockDocGet.mockResolvedValue({ exists: false });
  });

  it('persists Firebase profiles and role memberships without a Postgres user', async () => {
    const profile = await persistFirebaseUserProfile({
      id: 'firebase-uid',
      firebase_uid: 'firebase-uid',
      email: 'Rider@example.com',
      first_name: 'Rider',
      last_name: 'User',
      role: 'rider',
      is_verified: true,
    });

    expect(profile.email).toBe('rider@example.com');
    expect(mockSet).toHaveBeenCalledTimes(3);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'firebase-uid',
        firebase_uid: 'firebase-uid',
        email: 'rider@example.com',
        role: 'rider',
        is_verified: true,
      }),
      { merge: true },
    );
  });

  it('looks up Firestore users by Firebase UID and normalized email', async () => {
    const user = { firebase_uid: 'firebase-uid', email: 'rider@example.com', role: 'rider' };
    mockDocGet.mockResolvedValue({ exists: true, data: () => user });
    mockEmailQueryGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'firebase-uid', data: () => user }],
    });

    await expect(getFirestoreUserByUid('firebase-uid')).resolves.toEqual(user);
    await expect(getFirestoreUserByEmail('Rider@example.com')).resolves.toEqual(user);
  });
});
