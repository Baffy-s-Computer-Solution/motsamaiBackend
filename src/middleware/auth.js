const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../utils/apiError');
const { User } = require('../models');
const config = require('../config');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, config.JWT.secret);
    
    let user;
    try {
      user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password_hash'] }
      });
    } catch (dbError) {
      logger.warn('Auth user lookup failed; continuing with verified JWT payload', { error: dbError.message });
      user = {
        id: decoded.id,
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
      try {
        user = await User.findByPk(decoded.id);
      } catch (dbError) {
        logger.warn('Optional auth user lookup failed; continuing with verified JWT payload', { error: dbError.message });
        user = {
          id: decoded.id,
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
