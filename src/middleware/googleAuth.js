/**
 * Google OAuth Token Verification Middleware
 * Verifies Firebase ID tokens from Google Sign-In
 * 
 * @module middleware/googleAuth
 */

const { admin, firebaseApps, isFirebaseEnabled } = require('../config/firebase');
const { BadRequestException, AuthenticationError } = require('../exceptions/api.exception');

/**
 * Initialize Firebase Admin SDK if not already initialized
 */
const initializeFirebase = () => {
  if (!isFirebaseEnabled || firebaseApps.length === 0) {
    const error = new AuthenticationError('Google sign-in is temporarily unavailable');
    error.statusCode = 503;
    error.status = 'error';
    throw error;
  }

  return firebaseApps;
};

/**
 * Verify Firebase ID token from Google Sign-In
 * @param {string} idToken - Firebase ID token to verify
 * @returns {Promise<Object>} Decoded token with user info
 */
const verifyGoogleToken = async (idToken) => {
  try {
    if (!idToken) {
      throw new BadRequestException('ID token is required');
    }

    const apps = initializeFirebase();
    let lastError = null;

    for (const app of apps) {
      try {
        const decodedToken = await admin.auth(app).verifyIdToken(idToken);
        if (decodedToken) {
          return decodedToken;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new AuthenticationError('Invalid token');
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof AuthenticationError) {
      throw error;
    }

    // Handle Firebase specific errors
    if (error.code === 'auth/id-token-expired') {
      throw new AuthenticationError('Token has expired');
    }
    if (error.code === 'auth/invalid-id-token') {
      throw new AuthenticationError('Invalid token');
    }
    
    throw new AuthenticationError('Token verification failed: ' + error.message);
  }
};

/**
 * Middleware to verify Google ID token in request body
 * Adds decoded token to req.googleToken
 */
const verifyGoogleTokenMiddleware = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      throw new BadRequestException('Google ID token is required');
    }

    const decodedToken = await verifyGoogleToken(idToken);
    req.googleToken = decodedToken;
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyGoogleToken,
  verifyGoogleTokenMiddleware,
  initializeFirebase
};
