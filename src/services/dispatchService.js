const { Ride, Driver, User } = require('../models');
const matchingService = require('./matching.service');
const socketService = require('./socketService');
const logger = require('../utils/logger');

/**
 * DispatchService - Handles the waterfall logic for assigning drivers to rides.
 */
class DispatchService {
  constructor() {
    this.requestTimeoutMs = 30000; // 30 seconds for a driver to accept
  }

  /**
   * Entry point for ride dispatching.
   * Finds candidates and starts the sequential notification process.
   */
  async dispatchRide(rideId) {
    const ride = await Ride.findByPk(rideId, { include: ['Rider'] });
    if (!ride) return;

    logger.info(`Starting dispatch for Ride ${rideId}`);

    // 1. Find the top 5 nearest candidates
    const candidates = await matchingService.findNearestDrivers(
      parseFloat(ride.pickup_lat),
      parseFloat(ride.pickup_lng),
      { limit: 5, vehicleType: ride.vehicle_type }
    );

    if (!candidates || candidates.length === 0) {
      logger.warn(`No drivers available for Ride ${rideId}`);
      await ride.update({ status: 'no_drivers_available' });
      socketService.io.to(`user:${ride.rider_id}`).emit('ride:no_drivers');
      return;
    }

    // 2. Begin sequential notification (Waterfall)
    await this._notifyNextDriver(ride, candidates, 0);
  }

  /**
   * Recursive function to notify drivers one by one
   */
  async _notifyNextDriver(ride, candidates, index) {
    if (index >= candidates.length) {
      logger.info(`Exhausted all candidates for Ride ${ride.id}`);
      await ride.update({ status: 'no_drivers_available' });
      socketService.io.to(`user:${ride.rider_id}`).emit('ride:no_drivers');
      return;
    }

    const driver = candidates[index];
    
    // Reload ride to check if it was cancelled by the user in the meantime
    const currentRide = await Ride.findByPk(ride.id);
    if (!currentRide || currentRide.status === 'cancelled') {
      logger.info(`Ride ${ride.id} was cancelled. Stopping dispatch.`);
      return;
    }

    logger.info(`Notifying Driver ${driver.id} for Ride ${ride.id}`);

    // Fetch user for the driver to get their socket_id
    const driverUser = await User.findByPk(driver.user_id);
    if (!driverUser || !driverUser.socket_id) {
      // If driver is offline, skip to next
      return this._notifyNextDriver(ride, candidates, index + 1);
    }

    // Emit request to the specific driver's socket
    socketService.io.to(driverUser.socket_id).emit('ride:request', {
      rideId: ride.id,
      pickup: ride.pickup_address,
      dropoff: ride.dropoff_address,
      fare: ride.fare_amount,
      timeout: this.requestTimeoutMs
    });

    // Set a timeout to check if the driver accepted
    setTimeout(async () => {
      const refreshedRide = await Ride.findByPk(ride.id);
      
      // If ride is still "searching" or "pending", the driver didn't accept
      if (refreshedRide.status === 'searching' || refreshedRide.status === 'pending') {
        logger.info(`Driver ${driver.id} timed out for Ride ${ride.id}. Trying next...`);
        this._notifyNextDriver(ride, candidates, index + 1);
      }
    }, this.requestTimeoutMs);
  }

  /**
   * Called when a driver accepts a ride via Socket
   */
  async handleAcceptance(rideId, driverId) {
    const ride = await Ride.findByPk(rideId);
    const driver = await Driver.findByPk(driverId);

    if (!ride || !driver || ride.status !== 'searching') {
      throw new Error('Ride no longer available or already accepted');
    }

    await ride.update({ 
      driver_id: driverId, 
      status: 'accepted',
      accepted_at: new Date() 
    });

    await driver.update({ status: 'busy' });

    logger.info(`Ride ${rideId} accepted by Driver ${driverId}`);
  }
}

module.exports = new DispatchService();