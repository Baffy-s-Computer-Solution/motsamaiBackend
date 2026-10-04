const BaseRepository = require('./base.repository');
const { Ride } = require('../models');
const { Op } = require('sequelize');

/**
 * Ride Repository
 * Handles specialized data access for Ride entities
 */
class RideRepository extends BaseRepository {
  constructor() {
    super(Ride);
  }

  async findActiveRideByRiderId(riderId) {
    return await this.findOne({
      where: {
        rider_id: riderId,
        status: {
          [Op.in]: ['pending', 'accepted', 'arrived', 'picked_up']
        }
      }
    });
  }
}

module.exports = new RideRepository();