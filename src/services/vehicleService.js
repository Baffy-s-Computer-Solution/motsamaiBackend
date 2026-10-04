const BaseService = require('./base.service');
const vehicleRepository = require('../repositories/vehicle.repository');

class VehicleService extends BaseService {
  constructor() {
    super(vehicleRepository);
  }

  async getVehicleByDriver(driverId) {
    const vehicle = await this.repository.findByDriverId(driverId);
    return vehicle;
  }
}

module.exports = new VehicleService();