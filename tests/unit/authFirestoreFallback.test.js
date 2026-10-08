const mockUserFindOne = jest.fn();
const mockUserCreate = jest.fn();
const mockDriverUpdate = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetFirebaseUser = jest.fn();
const mockGetFirebaseUserByEmail = jest.fn();
const mockUpdateFirebaseUser = jest.fn();
const mockCreateFirebaseUser = jest.fn();
const mockGetFirestoreUserByUid = jest.fn();
const mockGetFirestoreUserByEmail = jest.fn();
const mockPersistFirebaseUserProfile = jest.fn();
const mockSyncFirebaseRoleClaims = jest.fn();
const mockSyncUserToFirestore = jest.fn();
const mockEmailVerificationLink = jest.fn();
const mockFirestoreUserData = jest.fn();
const mockUploadRemoteImage = jest.fn();
const mockFirebaseAuth = {
  verifyIdToken: mockVerifyIdToken,
  getUser: mockGetFirebaseUser,
  getUserByEmail: mockGetFirebaseUserByEmail,
  updateUser: mockUpdateFirebaseUser,
  createUser: mockCreateFirebaseUser,
  generateEmailVerificationLink: mockEmailVerificationLink,
};
const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(async () => ({
        exists: Boolean(mockFirestoreUserData()),
        data: () => mockFirestoreUserData(),
      })),
    })),
  })),
};

jest.mock('../../src/config', () => ({
  JWT: { secret: 'test-jwt-secret', refreshSecret: 'test-refresh-secret', expiresIn: '1h' },
  CONFIGURED_ADMIN: { email: 'admin@example.com', name: 'Motsamai Admin' },
  DEMO_ADMIN: {},
}));

jest.mock('../../src/models', () => ({
  User: { findOne: mockUserFindOne, create: mockUserCreate },
  Driver: { update: mockDriverUpdate },
}));

jest.mock('../../src/config/firebase', () => ({
  admin: {
    auth: jest.fn(() => mockFirebaseAuth),
    firestore: jest.fn(() => mockFirestore),
  },
  authFirebaseApp: {},
  firestoreFirebaseApp: {},
  isAuthFirebaseEnabled: true,
  isFirestoreFirebaseEnabled: true,
}));

jest.mock('../../src/services/firestoreUserService', () => ({
  syncUserToFirestore: mockSyncUserToFirestore,
  syncFirebaseRoleClaims: mockSyncFirebaseRoleClaims,
  getFirestoreUserByUid: mockGetFirestoreUserByUid,
  getFirestoreUserByEmail: mockGetFirestoreUserByEmail,
  persistFirebaseUserProfile: mockPersistFirebaseUserProfile,
}));

jest.mock('../../src/adapters/email.adapter', () => ({ send: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/storageService', () => ({ uploadRemoteImage: mockUploadRemoteImage }));

const authController = require('../../src/controllers/authController');

const callHandler = (handler, req) => new Promise((resolve, reject) => {
  const res = {
    status: jest.fn(function setStatus(status) {
      this.statusCode = status;
      return this;
    }),
    json: jest.fn((body) => resolve({ status: res.statusCode, body })),
  };
  handler(req, res, reject);
});

describe('Firebase authentication when Postgres is unavailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindOne.mockRejectedValue({
      name: 'SequelizeConnectionRefusedError',
      message: 'Postgres connection refused',
    });
    mockPersistFirebaseUserProfile.mockImplementation(async (profile) => profile);
    mockSyncFirebaseRoleClaims.mockResolvedValue(undefined);
    mockSyncUserToFirestore.mockResolvedValue(undefined);
    mockGetFirestoreUserByUid.mockResolvedValue(null);
    mockGetFirestoreUserByEmail.mockResolvedValue(null);
    mockFirestoreUserData.mockReturnValue({
      user_id: 'firebase-rider-uid',
      firebase_uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      name: 'Rider User',
      role: 'rider',
      status: 'active',
      is_active: true,
      is_verified: true,
    });
    mockVerifyIdToken.mockResolvedValue({ uid: 'firebase-rider-uid', email: 'rider@example.com' });
    mockGetFirebaseUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
    mockUpdateFirebaseUser.mockImplementation(async (uid, updates) => ({
      uid,
      email: 'admin@example.com',
      displayName: updates.displayName,
      emailVerified: updates.emailVerified,
      disabled: updates.disabled,
      customClaims: {},
    }));
    mockCreateFirebaseUser.mockImplementation(async (user) => ({
      uid: 'firebase-admin-uid',
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      customClaims: {},
    }));
    mockGetFirebaseUser.mockResolvedValue({
      uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      displayName: 'Rider User',
      emailVerified: true,
      disabled: false,
      customClaims: {},
    });
    mockEmailVerificationLink.mockResolvedValue('https://motsamai.web.app/verify-email');
    mockUploadRemoteImage.mockResolvedValue(null);
  });

  it('authenticates an email Firebase user and stores the profile in Firestore', async () => {
    const response = await callHandler(authController.login, {
      body: { email: 'rider@example.com', idToken: 'firebase-id-token' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(expect.objectContaining({
      id: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
    }));
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(mockPersistFirebaseUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-rider-uid',
      role: 'rider',
      is_verified: true,
    }));
  });

  it('persists Firebase-authenticated users missing from Postgres into Firestore', async () => {
    mockUserFindOne.mockResolvedValue(null);

    const response = await callHandler(authController.login, {
      body: { email: 'rider@example.com', idToken: 'firebase-id-token' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(expect.objectContaining({
      id: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
    }));
    expect(mockPersistFirebaseUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-rider-uid',
      role: 'rider',
    }));
  });

  it('creates a rider profile in Firestore when PostgreSQL registration lookup fails', async () => {
    mockGetFirebaseUser.mockResolvedValueOnce({
      uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      displayName: 'Rider User',
      emailVerified: false,
      disabled: false,
      customClaims: {},
    });
    const response = await callHandler(authController.register, {
      body: {
        email: 'rider@example.com',
        password: 'not-persisted-in-firestore',
        name: 'Rider User',
        role: 'rider',
        firebase_uid: 'firebase-rider-uid',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      verificationRequired: true,
      user: expect.objectContaining({ id: 'firebase-rider-uid', role: 'rider' }),
    }));
    const persistedProfile = mockPersistFirebaseUserProfile.mock.calls[0][0];
    expect(persistedProfile).not.toHaveProperty('password');
    expect(persistedProfile.password_hash).toBeNull();
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it('does not report successful registration when Firestore profile persistence fails', async () => {
    mockUserFindOne.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: 42,
      firebase_uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
      toJSON: () => ({ id: 42, email: 'rider@example.com', role: 'rider' }),
    });
    mockSyncUserToFirestore.mockRejectedValue(new Error('Firestore profile write failed'));

    await expect(callHandler(authController.register, {
      body: {
        email: 'rider@example.com',
        password: 'not-persisted-in-firestore',
        name: 'Rider User',
        role: 'rider',
        firebase_uid: 'firebase-rider-uid',
      },
    })).rejects.toThrow('Firestore profile write failed');
  });

  it('does not report successful Google sign-in when Firestore profile persistence fails', async () => {
    mockUserFindOne.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: 43,
      firebase_uid: 'firebase-driver-uid',
      email: 'driver@example.com',
      role: 'driver',
      toJSON: () => ({ id: 43, email: 'driver@example.com', role: 'driver' }),
    });
    mockSyncUserToFirestore.mockRejectedValue(new Error('Firestore profile write failed'));

    await expect(callHandler(authController.googleSignIn, {
      body: {
        email: 'driver@example.com',
        displayName: 'Driver User',
        role: 'driver',
      },
      googleToken: {
        uid: 'firebase-driver-uid',
        email: 'driver@example.com',
        name: 'Driver User',
      },
    })).rejects.toThrow('Firestore profile write failed');
  });

  it('creates a driver profile in Firestore when PostgreSQL registration lookup fails', async () => {
    mockGetFirebaseUser.mockResolvedValueOnce({
      uid: 'firebase-driver-uid',
      email: 'driver@example.com',
      displayName: 'Driver User',
      emailVerified: false,
      disabled: false,
      customClaims: {},
    });

    const response = await callHandler(authController.register, {
      body: {
        email: 'driver@example.com',
        password: 'not-persisted-in-firestore',
        name: 'Driver User',
        role: 'driver',
        firebase_uid: 'firebase-driver-uid',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      verificationRequired: true,
      user: expect.objectContaining({ id: 'firebase-driver-uid', role: 'driver' }),
    }));
    expect(mockPersistFirebaseUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-driver-uid',
      role: 'driver',
      is_verified: false,
    }));
  });

  it('rejects Firebase sign-in until the account email is verified', async () => {
    mockUserFindOne.mockResolvedValue({
      firebase_uid: 'firebase-rider-uid',
      is_active: true,
      is_verified: false,
    });
    mockGetFirebaseUser.mockResolvedValueOnce({
      uid: 'firebase-rider-uid',
      email: 'rider@example.com',
      displayName: 'Rider User',
      emailVerified: false,
      disabled: false,
      customClaims: {},
    });

    await expect(callHandler(authController.login, {
      body: {
        email: 'rider@example.com',
        password: 'rider-password',
        idToken: 'firebase-id-token',
      },
    })).rejects.toThrow('Please verify your email before signing in');

    expect(mockPersistFirebaseUserProfile).not.toHaveBeenCalled();
  });

  it('authenticates a Google user and creates their Firestore profile without Postgres', async () => {
    mockFirestoreUserData.mockReturnValue(null);
    const response = await callHandler(authController.googleSignIn, {
      body: {
        email: 'rider@example.com',
        displayName: 'Rider User',
        role: 'rider',
      },
      googleToken: { uid: 'firebase-rider-uid', email: 'rider@example.com' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(expect.objectContaining({
      id: 'firebase-rider-uid',
      email: 'rider@example.com',
      role: 'rider',
    }));
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(mockPersistFirebaseUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-rider-uid',
      role: 'rider',
    }));
  });

  it('claims the configured administrator in Firebase Auth and Firestore without Postgres', async () => {
    mockFirestoreUserData.mockReturnValue(null);

    const response = await callHandler(authController.login, {
      body: { email: 'admin@example.com', password: 'NewAdminPassword123!' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual(expect.objectContaining({
      id: 'firebase-admin-uid',
      email: 'admin@example.com',
      role: 'admin',
    }));
    expect(mockCreateFirebaseUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'admin@example.com',
      password: 'NewAdminPassword123!',
      emailVerified: true,
      disabled: false,
    }));
    expect(mockPersistFirebaseUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-admin-uid',
      role: 'admin',
      is_active: true,
      is_verified: true,
    }));
    expect(mockSyncFirebaseRoleClaims).toHaveBeenCalledWith(expect.objectContaining({
      firebase_uid: 'firebase-admin-uid',
      role: 'admin',
    }));
  });
});
