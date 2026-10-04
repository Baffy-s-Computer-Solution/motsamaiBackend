const { Zone, sequelize, Sequelize } = require('../models');
const logger = require('../utils/logger');

class GeofenceService {
  /**
   * Check if a driver is in a geofenced zone
   * @param {string} driverId - Driver ID
   * @param {Object} location - { lat, lng }
   * @returns {Promise<Object|null>} - Zone info or null
   */
  async checkDriverZone(driverId, location) {
    try {
      const zone = await Zone.findOne({
        where: {
          is_active: true,
          [Sequelize.Op.and]: sequelize.where(
            sequelize.fn('ST_Contains', sequelize.col('boundary'), 
              sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', location.lng, location.lat), 4326)
            ),
            true
          )
        }
      });
      
      if (zone) logger.info(`Driver ${driverId} is in zone ${zone.name}`);
      return zone;
    } catch (error) {
      logger.error('Geofence check failed:', error);
      return null;
    }
  }

  /**
   * Get zone by coordinates (simple bounding box version)
   */
  async getZoneByCoordinates(lat, lng) {
    try {
      const point = sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', lng, lat), 4326);
      const zone = await Zone.findOne({
        where: {
          is_active: true,
          [Sequelize.Op.and]: sequelize.where(
            sequelize.fn('ST_Contains', sequelize.col('boundary'), point),
            true
          )
        }
      });
      return zone;
    } catch (error) {
      logger.error('Get zone by coordinates failed:', error);
      return null;
    }
  }
}

module.exports = new GeofenceService();