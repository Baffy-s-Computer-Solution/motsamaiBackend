const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');
const geofenceService = require('./geofenceService');

class SocketService {
  init(io) {
    this.io = io;

    this.io.on('connection', (socket) => {
      logger.info(`New WebSocket connection: ${socket.id}`);

      // Driver joins their own room and updates location
      socket.on('driver:join', (driverId) => {
        socket.join(`driver:${driverId}`);
        logger.info(`Driver ${driverId} joined room`);
      });

      socket.on('driver:location_update', async (data) => {
        const { driverId, location } = data; // location: { lat, lng }
        
        // 1. Cache in Redis for real-time proximity lookups
        const redisKey = `driver_loc:${driverId}`;
        await redisClient.set(redisKey, JSON.stringify(location), {
          EX: 300 // Expire in 5 minutes if no updates
        });

        // 2. Check Geo-fencing
        const zone = await geofenceService.checkDriverZone(driverId, location);
        if (zone) {
          // Notify driver they are in a high-demand zone
          socket.emit('driver:zone_entry', zone);
        }

        // 2. Broadcast to riders tracking this driver
        this.io.to(`tracking:${driverId}`).emit('location_update', {
          driverId,
          location,
          timestamp: new Date()
        });
      });

      // Rider joins a room to track a specific driver
      socket.on('rider:track_driver', (driverId) => {
        socket.join(`tracking:${driverId}`);
        logger.info(`Rider subscribed to tracking driver ${driverId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }
}

module.exports = new SocketService();