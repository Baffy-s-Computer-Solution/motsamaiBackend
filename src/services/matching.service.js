const { sequelize, Driver, Vehicle, Ride } = require('../models');
const { Op, fn, col, lit } = require('sequelize');
const logger = require('../utils/logger');
const routeOptimizationService = require('./ai/routeOptimization.service'); 

/**
 * MatchingService - Handles discovery of drivers using PostGIS spatial queries.
 */
class MatchingService {
  /**
   * Finds the nearest available drivers for a pickup location.
   * @param {number} latitude 
   * @param {number} longitude 
   * @param {Object} options 
   */
  async findNearestDrivers(latitude, longitude, options = {}) {
    const {
      radiusKm = 5,
      limit = 10,
      vehicleType = null,
      minRating = 0
    } = options;

    const radiusInMeters = radiusKm * 1000;

    try {
      // Construct PostGIS Point: ST_SetSRID(ST_MakePoint(long, lat), 4326)
      const point = fn('ST_SetSRID', fn('ST_MakePoint', longitude, latitude), 4326);

      const drivers = await Driver.findAll({
        attributes: {
          include: [
            [
              fn('ST_Distance', col('current_location'), point),
              'distance_meters'
            ]
          ]
        },
        include: [{
          model: Vehicle,
          where: vehicleType ? { type: vehicleType } : {},
          required: true
        }],
        where: {
          status: 'available',
          rating: { [Op.gte]: minRating },
          // Spatial filter using ST_DWithin for performance (uses spatial index)
          [Op.and]: [
            sequelize.where(
              fn('ST_DWithin', col('current_location'), point, radiusInMeters),
              true
            )
          ]
        },
        order: [
          [lit('distance_meters'), 'ASC']
        ],
        limit: limit
      });

      return drivers;
    } catch (error) {
      logger.error('Spatial driver matching failed:', error);
      throw error;
    }
  }

  /**
   * Matches a single best driver based on a scoring algorithm.
   * Replaces pure distance with ETA-based scoring.
   */
  async matchDriver(rideRequest) {
    const { pickup_lat, pickup_lng, vehicle_type } = rideRequest;
    
    const candidates = await this.findNearestDrivers(Number(pickup_lat), Number(pickup_lng), {
      vehicleType: vehicle_type,
      radiusKm: 10,
      limit: 20
    });

    if (!candidates || candidates.length === 0) {
      return null;
    }

    // Refine candidates using Route Optimization (ETA)
    const scoredDrivers = await Promise.all(candidates.map(async (driver) => {
      const distMeters = driver.getDataValue('distance_meters');
      const distKm = distMeters / 1000;

      // Use AI Route Service to get a realistic ETA
      const etaMinutes = routeOptimizationService.calculateETA(distKm, 40, {
        isPeakHour: this._isPeakHour(),
        weather: 'clear' // In production, integrate a weather API here
      });

      const rating = Number(driver.rating) || 4.0;

      // Scoring: Lower ETA is better (inverted). 
      // Penalty for low ratings.
      const timeScore = Math.max(0, 30 - etaMinutes); 
      const finalScore = (timeScore * 0.8) + (rating * 2.5);

      return { driver, score: finalScore, eta: etaMinutes };
    }));

    // Sort by score descending
    scoredDrivers.sort((a, b) => b.score - a.score);

    return scoredDrivers[0].driver;
  }

  _isPeakHour() {
    const hour = new Date().getHours();
    // Morning rush: 7-9 AM, Evening rush: 4-7 PM
    return (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
  }
}

module.exports = new MatchingService();