/**
 * Firebase Configuration Module
 * Handles Firebase Admin SDK initialization and configuration
 * 
 * @module config/firebase.config
 */

module.exports = {
  // Firebase Admin SDK Configuration
  FIREBASE: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    clientId: process.env.FIREBASE_CLIENT_ID,
    clientX509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  },

  // JWT Configuration for OAuth tokens
  JWT: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRATION || '24h',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  },

  // Default values for OAuth users
  OAUTH: {
    // Default phone number for OAuth users who don't provide one
    defaultPhone: process.env.DEFAULT_PHONE_FOR_OAUTH || '+1234567890',
    // Auto-create user on first OAuth sign-in
    autoCreateUser: process.env.OAUTH_AUTO_CREATE !== 'false',
  }
};
