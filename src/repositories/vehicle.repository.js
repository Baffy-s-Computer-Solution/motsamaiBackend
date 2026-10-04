const BaseRepository = require('./base.repository');
const { Vehicle } = require('../models');

class VehicleRepository extends BaseRepository {
  constructor() {
    super(Vehicle);
  }

  async findByDriverId(driverId) {
    return await this.model.findOne({ where: { driver_id: driverId } });
  }
}

module.exports = new VehicleRepository();