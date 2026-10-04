const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { admin, isFirebaseEnabled } = require('../config/firebase');

const buildCorsOrigins = () => {
  const origins = [
    ...(Array.isArray(config.CORS_ORIGINS) ? config.CORS_ORIGINS : []),
    ...(Array.isArray(config.websocket?.cors?.origin) ? config.websocket.cors.origin : []),
    process.env.FRONTEND_URL,
    process.env.APP_BASE_URL,
  ].filter(Boolean);

  const uniqueOrigins = [...new Set(origins)];

  if (uniqueOrigins.length > 0) {
    return uniqueOrigins.includes('*') ? '*' : uniqueOrigins;
  }

  return ['http://localhost:5173', 'http://localhost:3000'];
};

const initializeSocket = (server) => {
  if (!config.ENABLE_WEBSOCKETS) {
    logger.info('WebSockets disabled by configuration');
    return null;
  }

  const io = new Server(server, {
    path: config.SOCKET_PATH || config.websocket?.path || '/socket.io',
    cors: {
      origin: buildCorsOrigins(),
      credentials: config.CORS_CREDENTIALS,
      methods: ['GET', 'POST'],
    },
    pingTimeout: config.SOCKET_PING_TIMEOUT || config.websocket?.pingTimeout,
    pingInterval: config.SOCKET_PING_INTERVAL || config.websocket?.pingInterval,
    transports: config.websocket?.transports || ['websocket', 'polling'],
    allowUpgrades: true,
    maxHttpBufferSize: config.websocket?.maxHttpBufferSize,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      socket.user = jwt.verify(token, config.JWT.secret);
      return next();
    } catch (error) {
      if (!isFirebaseEnabled) {
        logger.warn({ socketId: socket.id, error: error.message }, 'Socket JWT authentication failed');
        return next(new Error('Invalid authentication token'));
      }

      try {
        const firebaseUser = await admin.auth().verifyIdToken(token);
        socket.user = {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: firebaseUser.role || (firebaseUser.admin ? 'admin' : 'user'),
          authProvider: 'firebase',
        };
        return next();
      } catch (firebaseError) {
        logger.warn(
          { socketId: socket.id, jwtError: error.message, firebaseError: firebaseError.message },
          'Socket authentication failed'
        );
        return next(new Error('Invalid authentication token'));
      }
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user?.id }, 'Socket connected');

    const role = socket.user?.role?.toLowerCase();

    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
    if (role === 'admin') {
      socket.join('admin:rides');
    }
    if (role === 'driver' && socket.user?.id) {
      socket.join(`driver:${socket.user.id}`);
    }

    socket.emit('reconnect_success', { connected: true, socketId: socket.id });

    socket.on('client_ready', (payload) => {
      socket.emit('server_ready', {
        receivedAt: new Date().toISOString(),
        clientTimestamp: payload?.timestamp,
      });
    });

    socket.on('subscribe', ({ channel }) => {
      if (typeof channel === 'string' && channel.length <= 100) {
        socket.join(channel);
      }
    });

    socket.on('unsubscribe', ({ channel }) => {
      if (typeof channel === 'string' && channel.length <= 100) {
        socket.leave(channel);
      }
    });

    socket.on('subscribe_ride', ({ rideId }) => {
      if (rideId) {
        socket.join(`ride:${rideId}`);
      }
    });

    socket.on('unsubscribe_ride', ({ rideId }) => {
      if (rideId) {
        socket.leave(`ride:${rideId}`);
      }
    });

    socket.on('subscribe_driver', ({ driverId }) => {
      if (driverId) {
        socket.join(`driver:${driverId}`);
      }
    });

    socket.on('driver_location_update', (payload) => {
      if (payload?.rideId) {
        io.to(`ride:${payload.rideId}`).emit('driver_location_updated', {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  return io;
};

module.exports = { initializeSocket };
