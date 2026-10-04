const BaseService = require('./base.service');
const rideRepository = require('../repositories/ride.repository');

class RideService extends BaseService {
  constructor() {
    super(rideRepository);
  }

  async getRiderHistory(riderId) {
    return await this.repository.findAll({ where: { rider_id: riderId } });
  }

  async create(data) {
    const pickup = data.pickup_location || data.pickup || {};
    const dropoff = data.dropoff_location || data.dropoff || {};
    const pickupLat = pickup.lat ?? pickup.latitude;
    const pickupLng = pickup.lng ?? pickup.longitude;
    const dropoffLat = dropoff.lat ?? dropoff.latitude;
    const dropoffLng = dropoff.lng ?? dropoff.longitude;

    return this.repository.create({
      rider_id: data.rider_id,
      pickup_address: pickup.address || 'Pickup location',
      dropoff_address: dropoff.address || 'Drop-off location',
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      status: data.status || 'requested',
      distance_km: data.distance_km || null,
      fare_amount: data.fare_amount ?? data.estimatedFare ?? null,
    });
  }

  async updateRideStatus(rideId, status, driverId = null) {
    const ride = await this.repository.findById(rideId);
    if (!ride) throw new Error('Ride not found');

    const transitions = {
      requested: ['accepted', 'cancelled'],
      searching: ['accepted', 'cancelled'],
      accepted: ['arrived', 'cancelled'],
      arrived: ['picked_up', 'cancelled'],
      picked_up: ['completed', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
    };
    if (status === 'accepted' && driverId) {
      if (ride.driver_id && String(ride.driver_id) !== String(driverId)) {
        throw new Error('Ride is already assigned to another driver');
      }
      ride.driver_id = driverId;
    }
    if (!transitions[ride.status]?.includes(status)) {
      throw new Error(`Cannot change ride from ${ride.status} to ${status}`);
    }

    await ride.save();
    return await this.update(rideId, { 
      status,
      status_updated_at: new Date()
    });
  }
}

module.exports = new RideService();