const {
  admin,
  authFirebaseApp,
  firestoreFirebaseApp,
  isAuthFirebaseEnabled,
  isFirestoreFirebaseEnabled,
} = require('../config/firebase');

const USERS_COLLECTION = 'users';
const USER_ROLES_COLLECTION = 'user_roles';
const ROLE_MEMBERSHIPS_COLLECTION = 'role_memberships';
const isFirestoreUserSyncEnabled = process.env.FIRESTORE_USER_SYNC_ENABLED !== 'false';

const normalizeRole = (role) => (
  ['rider', 'driver', 'admin', 'support', 'fleet_owner'].includes(role) ? role : 'rider'
);

const toIso = (value) => {
  if (!value) return null;
  const resolvedValue = typeof value.toDate === 'function' ? value.toDate() : value;
  const date = resolvedValue instanceof Date ? resolvedValue : new Date(resolvedValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildUserDocument = (user) => ({
  user_id: String(user.id || user.firebase_uid),
  firebase_uid: user.firebase_uid || null,
  name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
  first_name: user.first_name || null,
  last_name: user.last_name || null,
  email: user.email || null,
  role: normalizeRole(user.role),
  status: user.status || (user.is_active === false || user.disabled ? 'disabled' : 'active'),
  is_active: user.is_active !== false && !user.disabled,
  is_verified: Boolean(user.is_verified || user.email_verified_at),
  email_verified_at: toIso(user.email_verified_at),
  phone: user.phone || null,
  avatar_url: user.avatar_url || user.profile_picture || user.photoURL || null,
  profile_picture: user.profile_picture || user.avatar_url || user.photoURL || null,
  metadata: user.metadata || {},
  last_login: toIso(user.last_login || user.last_login_at),
  updated_at: admin.firestore.FieldValue.serverTimestamp(),
});

const buildRoleMembershipDocument = (user) => ({
  user_id: String(user.id),
  firebase_uid: user.firebase_uid || null,
  role: normalizeRole(user.role),
  email: user.email || null,
  status: user.status || 'active',
  updated_at: admin.firestore.FieldValue.serverTimestamp(),
});

const syncUserToFirestore = async (user) => {
  if (!isFirestoreUserSyncEnabled || !isFirestoreFirebaseEnabled || !firestoreFirebaseApp || !user) return;

  await writeUserDocuments(user);
};

const writeUserDocuments = async (user) => {
  if (!isFirestoreFirebaseEnabled || !firestoreFirebaseApp) {
    throw new Error('Firestore user storage is unavailable');
  }

  const db = admin.firestore(firestoreFirebaseApp);
  const userDocId = user.firebase_uid || String(user.id);
  const userDoc = db.collection(USERS_COLLECTION).doc(userDocId);
  const roleDoc = db.collection(USER_ROLES_COLLECTION).doc(userDocId);
  const membershipDoc = db
    .collection(ROLE_MEMBERSHIPS_COLLECTION)
    .doc(normalizeRole(user.role))
    .collection('users')
    .doc(userDocId);

  await Promise.all([
    userDoc.set(buildUserDocument(user), { merge: true }),
    roleDoc.set(buildRoleMembershipDocument(user), { merge: true }),
    membershipDoc.set(buildRoleMembershipDocument(user), { merge: true }),
  ]);
};

const getFirestoreUserByUid = async (uid) => {
  if (!uid) return null;
  if (!isFirestoreFirebaseEnabled || !firestoreFirebaseApp) {
    throw new Error('Firestore user storage is unavailable');
  }

  const snapshot = await admin.firestore(firestoreFirebaseApp)
    .collection(USERS_COLLECTION)
    .doc(String(uid))
    .get();
  return snapshot.exists ? { ...snapshot.data(), firebase_uid: snapshot.data().firebase_uid || String(uid) } : null;
};

const getFirestoreUserByEmail = async (email) => {
  if (!email) return null;
  if (!isFirestoreFirebaseEnabled || !firestoreFirebaseApp) {
    throw new Error('Firestore user storage is unavailable');
  }

  const snapshot = await admin.firestore(firestoreFirebaseApp)
    .collection(USERS_COLLECTION)
    .where('email', '==', String(email).trim().toLowerCase())
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const document = snapshot.docs[0];
  return { ...document.data(), firebase_uid: document.data().firebase_uid || document.id };
};

const persistFirebaseUserProfile = async (user) => {
  if (!user?.firebase_uid && !user?.id) {
    throw new Error('A Firebase UID is required to persist a Firestore user profile');
  }

  const firebaseUid = String(user.firebase_uid || user.id);
  const profile = {
    ...user,
    id: firebaseUid,
    firebase_uid: firebaseUid,
    email: String(user.email || '').trim().toLowerCase(),
    role: normalizeRole(user.role),
  };

  await writeUserDocuments(profile);
  return profile;
};

const syncAllFirebaseUsersToFirestore = async () => {
  if (!isFirestoreUserSyncEnabled || !isAuthFirebaseEnabled || !isFirestoreFirebaseEnabled) return { synced: 0 };

  const auth = admin.auth(authFirebaseApp);
  let pageToken;
  let synced = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    await Promise.all(page.users.map(async (firebaseUser) => {
      const role = normalizeRole(firebaseUser.customClaims?.role);
      await syncUserToFirestore({
        id: firebaseUser.uid,
        firebase_uid: firebaseUser.uid,
        name: firebaseUser.displayName,
        email: firebaseUser.email,
        role,
        status: firebaseUser.disabled ? 'disabled' : 'active',
        avatar_url: firebaseUser.photoURL,
        last_login: firebaseUser.metadata?.lastSignInTime,
      });
      synced += 1;
    }));
    pageToken = page.pageToken;
  } while (pageToken);

  return { synced };
};

const syncFirebaseRoleClaims = async (user) => {
  if (!isAuthFirebaseEnabled || !authFirebaseApp || !user?.firebase_uid) return;
  const role = user.role || 'rider';
  await admin.auth(authFirebaseApp).setCustomUserClaims(user.firebase_uid, { role });
};

module.exports = {
  syncUserToFirestore,
  getFirestoreUserByUid,
  getFirestoreUserByEmail,
  persistFirebaseUserProfile,
  syncAllFirebaseUsersToFirestore,
  syncFirebaseRoleClaims,
  USERS_COLLECTION,
  USER_ROLES_COLLECTION,
  ROLE_MEMBERSHIPS_COLLECTION,
};
