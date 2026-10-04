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
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildUserDocument = (user) => ({
  user_id: String(user.id || user.firebase_uid),
  firebase_uid: user.firebase_uid || null,
  name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
  email: user.email || null,
  role: normalizeRole(user.role),
  status: user.status || (user.disabled ? 'disabled' : 'active'),
  phone: user.phone || null,
  avatar_url: user.avatar_url || user.profile_picture || user.photoURL || null,
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
  syncAllFirebaseUsersToFirestore,
  syncFirebaseRoleClaims,
  USERS_COLLECTION,
  USER_ROLES_COLLECTION,
  ROLE_MEMBERSHIPS_COLLECTION,
};
