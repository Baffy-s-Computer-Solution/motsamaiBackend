const mockJwtVerify = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockUserFindByPk = jest.fn();
const mockGetFirestoreUserByUid = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: mockJwtVerify,
}));

jest.mock('../../src/config', () => ({
  JWT: { secret: 'test-secret' },
}));

jest.mock('../../src/config/firebase', () => ({
  admin: {
    auth: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
  },
  authFirebaseApp: {},
  isAuthFirebaseEnabled: true,
}));

jest.mock('../../src/models', () => ({
  User: { findByPk: mockUserFindByPk },
}));

jest.mock('../../src/services/firestoreUserService', () => ({
  getFirestoreUserByUid: mockGetFirestoreUserByUid,
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../src/utils/isDatabaseUnavailable', () => jest.fn(() => false));

const { auth } = require('../../src/middleware/auth');

describe('Firebase ID token authentication middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtVerify.mockImplementation(() => {
      throw new Error('Not a backend JWT');
    });
    mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
    });
    mockGetFirestoreUserByUid.mockResolvedValue({
      user_id: 'postgres-user-id',
      firebase_uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
      is_active: true,
    });
  });

  it('verifies Firebase ID tokens and resolves the Firestore user profile', async () => {
    const req = {
      headers: { authorization: 'Bearer firebase-id-token' },
    };
    const next = jest.fn();

    await auth(req, {}, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('firebase-id-token', true);
    expect(mockGetFirestoreUserByUid).toHaveBeenCalledWith('firebase-rider-uid');
    expect(req.user).toEqual(expect.objectContaining({
      id: 'postgres-user-id',
      firebase_uid: 'firebase-rider-uid',
      role: 'rider',
    }));
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a token that is neither a backend JWT nor a verified Firebase ID token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Firebase token verification failed'));
    const next = jest.fn();

    await auth({
      headers: { authorization: 'Bearer invalid-token' },
    }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Invalid or expired authentication token',
    }));
    expect(mockGetFirestoreUserByUid).not.toHaveBeenCalled();
  });
});
