const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../utils/apiError');
const { User } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');
const { getFirestoreUserByUid } = require('../services/firestoreUserService');
const isDatabaseUnavailable = require('../utils/isDatabaseUnavailable');

const buildFirestoreAuthUser = (profile, decoded) => ({
  id: profile.user_id || decoded.id,
  firebase_uid: profile.firebase_uid || decoded.firebase_uid || decoded.id,
  email: profile.email || decoded.email,
  role: profile.role || decoded.role || 'rider',
  first_name: profile.first_name || null,
  last_name: profile.last_name || null,
  name: profile.name || null,
  phone: profile.phone || null,
  avatar_url: profile.avatar_url || null,
  is_active: profile.is_active !== false && profile.status !== 'disabled',
  is_verified: profile.is_verified !== false,
  verification_status: profile.verification_status || 'not_started',
});

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, config.JWT.secret);
    
    let user;
    let databaseUnavailable = false;
    const firebaseOnlyUser = decoded.firebase_uid && decoded.firebase_uid === decoded.id;
    if (!firebaseOnlyUser) {
      try {
        user = await User.findByPk(decoded.id, {
          attributes: { exclude: ['password_hash'] }
        });
      } catch (dbError) {
        if (!isDatabaseUnavailable(dbError)) throw dbError;
        databaseUnavailable = true;
        logger.warn('Postgres unavailable during auth lookup; checking Firestore user profile', { error: dbError.message });
      }
    }

    if (!user) {
      try {
        const firestoreProfile = await getFirestoreUserByUid(decoded.firebase_uid || decoded.id);
        if (firestoreProfile) {
          user = buildFirestoreAuthUser(firestoreProfile, decoded);
        }
      } catch (firestoreError) {
        logger.warn('Firestore auth profile lookup failed; using verified JWT claims', { error: firestoreError.message });
      }
    }

    if (!user) {
      if (!databaseUnavailable) {
        throw new AuthenticationError('User not found');
      }
      user = {
        id: decoded.id,
        firebase_uid: decoded.firebase_uid || null,
        email: decoded.email,
        role: decoded.role || 'rider',
        is_active: true,
        is_verified: true,
      };
    }
    
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    
    if (!user.is_active) {
      throw new AuthenticationError('Account is deactivated');
    }
    
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.JWT.secret);
      let user;

      if (!(decoded.firebase_uid && decoded.firebase_uid === decoded.id)) {
        try {
          user = await User.findByPk(decoded.id);
        } catch (dbError) {
          if (!isDatabaseUnavailable(dbError)) throw dbError;
          logger.warn('Postgres unavailable during optional auth lookup; checking Firestore', { error: dbError.message });
        }
      }

      if (!user) {
        try {
          const firestoreProfile = await getFirestoreUserByUid(decoded.firebase_uid || decoded.id);
          if (firestoreProfile) user = buildFirestoreAuthUser(firestoreProfile, decoded);
        } catch (firestoreError) {
          logger.warn('Optional Firestore auth lookup failed; continuing with verified JWT claims', { error: firestoreError.message });
        }
      }

      if (!user) {
        user = {
          id: decoded.id,
          firebase_uid: decoded.firebase_uid || null,
          email: decoded.email,
          role: decoded.role || 'rider',
          is_active: true,
        };
      }
      
      if (user && user.is_active) {
        req.user = user;
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

const requireVerifiedDriver = (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (req.user.role !== 'driver') {
      return next();
    }

    if (req.user.verification_status !== 'approved') {
      throw new AuthenticationError('Driver verification approval is required');
    }

    if (typeof req.user.requiresReverification === 'function' && req.user.requiresReverification()) {
      throw new AuthenticationError('Driver re-verification is required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

const requireDriverBiometric = (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (req.user.role !== 'driver') {
      return next();
    }

    if (typeof req.user.isBiometricLocked === 'function' && req.user.isBiometricLocked()) {
      throw new AuthenticationError('Biometric verification is temporarily locked');
    }

    if (req.user.biometric_enabled && !req.user.biometric_last_verified_at) {
      throw new AuthenticationError('Biometric login verification is required');
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { auth, optionalAuth, requireVerifiedDriver, requireDriverBiometric };
