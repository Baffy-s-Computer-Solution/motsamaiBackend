const admin = require('firebase-admin');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

const PRODUCTION_FIREBASE_PROJECT_ID = 'motsamai-10d22';
const PRODUCTION_FIREBASE_DATABASE_URL = 'https://motsamai-10d22-default-rtdb.firebaseio.com';

const localEnvPath = path.join(process.cwd(), '.env.development.local');
const localEnvFallback = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: false });
} else if (fs.existsSync(localEnvFallback)) {
  dotenv.config({ path: localEnvFallback, override: false });
}

const formatPrivateKey = (key = '') => key.replace(/\\n/g, '\n');

const parseJsonValue = (value, label) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed.private_key) {
      parsed.private_key = formatPrivateKey(parsed.private_key);
    }
    return parsed;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Invalid ${label} value.`);
    return null;
  }
};

const readServiceAccountPath = (serviceAccountPath, label) => {
  if (!serviceAccountPath) return null;

  const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    // eslint-disable-next-line no-console
    console.warn(`${label} file not found at: ${resolvedPath}`);
    return null;
  }

  try {
    return parseJsonValue(fs.readFileSync(resolvedPath, 'utf8'), label);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Failed reading ${label} file: ${error.message}`);
    return null;
  }
};

const getCredentialFromEnvParts = (prefix) => {
  const projectId = process.env[`${prefix}_PROJECT_ID`];
  const clientEmail = process.env[`${prefix}_CLIENT_EMAIL`];
  const privateKey = formatPrivateKey(process.env[`${prefix}_PRIVATE_KEY`] || '');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return admin.credential.cert({ projectId, clientEmail, privateKey });
};

const getCredential = (prefix) => {
  const serviceAccount = parseJsonValue(
    process.env[`${prefix}_SERVICE_ACCOUNT_JSON`],
    `${prefix}_SERVICE_ACCOUNT_JSON`
  ) || readServiceAccountPath(
    process.env[`${prefix}_SERVICE_ACCOUNT_PATH`],
    `${prefix}_SERVICE_ACCOUNT_PATH`
  );

  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }

  return getCredentialFromEnvParts(prefix);
};

const writeJsonCredentialsFile = (value, label) => {
  if (!value) return null;

  const parsed = parseJsonValue(value, label);
  if (!parsed) return null;

  const credentialsPath = path.join(os.tmpdir(), `${label.toLowerCase()}.json`);
  fs.writeFileSync(credentialsPath, JSON.stringify(parsed));
  return credentialsPath;
};

const configureApplicationCredentials = (prefix) => {
  const explicitPath = process.env[`${prefix}_GOOGLE_APPLICATION_CREDENTIALS`];
  if (explicitPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = explicitPath;
    return;
  }

  const inlineJson = process.env[`${prefix}_GOOGLE_APPLICATION_CREDENTIALS_JSON`]
    || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const generatedPath = writeJsonCredentialsFile(inlineJson, `${prefix}_GOOGLE_APPLICATION_CREDENTIALS_JSON`);

  if (generatedPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = generatedPath;
  }
};

const initializeFirebaseAdmin = ({
  appName,
  prefix,
  fallbackPrefix,
  useAdcEnv,
  databaseUrlEnv,
}) => {
  const existing = admin.apps.find((app) => app.name === appName);
  if (existing) return existing;

  const credential = getCredential(prefix) || (fallbackPrefix ? getCredential(fallbackPrefix) : null);
  const configuredProjectId = process.env[`${prefix}_PROJECT_ID`] || (fallbackPrefix ? process.env[`${fallbackPrefix}_PROJECT_ID`] : undefined);
  if (configuredProjectId && configuredProjectId !== PRODUCTION_FIREBASE_PROJECT_ID) {
    // Keep every Firebase Admin app pinned to the configured production project.
    console.warn(`${prefix}_PROJECT_ID must be ${PRODUCTION_FIREBASE_PROJECT_ID}; ignoring ${configuredProjectId}.`);
  }
  const projectId = PRODUCTION_FIREBASE_PROJECT_ID;
  const databaseURL = process.env[databaseUrlEnv]
    || (prefix === 'FIREBASE' ? PRODUCTION_FIREBASE_DATABASE_URL : undefined);
  const options = { databaseURL, projectId };

  if (credential) {
    return admin.initializeApp({ ...options, credential }, appName);
  }

  if (process.env[useAdcEnv] === 'true') {
    configureApplicationCredentials(prefix);
    return admin.initializeApp({ ...options, credential: admin.credential.applicationDefault() }, appName);
  }

  return null;
};

const authFirebaseApp = initializeFirebaseAdmin({
  appName: 'motsamai-auth',
  prefix: 'FIREBASE',
  fallbackPrefix: null,
  useAdcEnv: 'FIREBASE_USE_ADC',
  databaseUrlEnv: 'FIREBASE_DATABASE_URL',
});

if (!authFirebaseApp) {
  logger.error(
    'Firebase Auth Admin is unavailable. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in the deployment environment.'
  );
}

const firestoreFirebaseApp = initializeFirebaseAdmin({
  appName: 'motsamai-firestore',
  prefix: 'FIRESTORE',
  fallbackPrefix: 'FIREBASE',
  useAdcEnv: 'FIRESTORE_USE_ADC',
  databaseUrlEnv: 'FIRESTORE_DATABASE_URL',
});

const firebaseApps = [authFirebaseApp, firestoreFirebaseApp].filter(Boolean);
const isFirebaseEnabled = firebaseApps.length > 0;
const realtimeDatabase = authFirebaseApp ? admin.database(authFirebaseApp) : null;

module.exports = {
  admin,
  firebaseApp: authFirebaseApp,
  authFirebaseApp,
  firestoreFirebaseApp: firestoreFirebaseApp || authFirebaseApp,
  realtimeDatabase,
  firebaseApps,
  isFirebaseEnabled,
  isAuthFirebaseEnabled: Boolean(authFirebaseApp),
  isFirestoreFirebaseEnabled: Boolean(firestoreFirebaseApp || authFirebaseApp),
};
