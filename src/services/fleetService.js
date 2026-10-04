const BaseService = require('./base.service');
const fleetRepository = require('../repositories/fleet.repository');
const { Driver, Vehicle } = require('../models');

class FleetService extends BaseService {
  constructor() {
    super(fleetRepository);
  }

  /**
   * Associates a vehicle with a fleet
   */
  async addVehicle(fleetId, vehicleId) {
    const vehicle = await Vehicle.findByPk(vehicleId);
    if (!vehicle) throw new Error('Vehicle not found');
    
    return await vehicle.update({ fleet_id: fleetId });
  }

  /**
   * Associates a driver with a fleet
   */
  async addDriver(fleetId, driverId, role = 'driver') {
    const driver = await Driver.findByPk(driverId);
    if (!driver) throw new Error('Driver not found');
    
    return await driver.update({ 
      fleet_id: fleetId,
      metadata: { ...driver.metadata, fleetRole: role }
    });
  }

  async getFleetStats(fleetId) {
    // Logic for aggregating fleet-specific metrics
    return { fleetId, lastUpdate: new Date() };
  }
}

module.exports = new FleetService();