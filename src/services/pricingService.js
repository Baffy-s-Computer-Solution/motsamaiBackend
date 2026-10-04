const { Zone } = require('../models');
const config = require('../config');
const geofenceService = require('./geofenceService');
const logger = require('../utils/logger');

/**
 * PricingService - Handles dynamic fare calculations
 */
class PricingService {
  constructor() {
    // Default pricing constants from config
    this.defaults = config.PRICING || {
      baseFare: 2.0,
      perKmRate: 1.5,
      perMinuteRate: 0.3,
      minimumFare: 3.0,
      surgeMultiplierMax: 3.0
    };
  }

  /**
   * Calculates the estimated fare for a ride
   * @param {Object} params { pickup, dropoff, distanceKm, durationMin, vehicleType }
   */
  async calculateFare(params) {
    const { pickup, distanceKm, durationMin } = params;
    
    try {
      // 1. Check if pickup is in a Geofence Zone for specific base fare
      const zone = await geofenceService.checkDriverZone('SYSTEM', pickup);
      const baseFare = zone ? parseFloat(zone.base_fare) : this.defaults.baseFare;

      // 2. Calculate Distance and Time components
      const distanceCost = distanceKm * this.defaults.perKmRate;
      const timeCost = durationMin * this.defaults.perMinuteRate;

      // 3. Calculate Surge Multiplier
      const surge = this._getSurgeMultiplier();

      // 4. Compute Total
      let totalFare = (baseFare + distanceCost + timeCost) * surge;

      // 5. Enforce Minimum Fare
      totalFare = Math.max(totalFare, this.defaults.minimumFare);

      return {
        totalFare: parseFloat(totalFare.toFixed(2)),
        breakdown: {
          baseFare,
          distanceCost: parseFloat(distanceCost.toFixed(2)),
          timeCost: parseFloat(timeCost.toFixed(2)),
          surgeMultiplier: surge,
          isMinFareApplied: totalFare === this.defaults.minimumFare
        },
        currency: 'LSL', // Lesotho Loti
        zoneName: zone ? zone.name : 'Standard'
      };
    } catch (error) {
      logger.error('Fare calculation failed:', error);
      // Fallback to basic calculation
      const fallback = (this.defaults.baseFare + (distanceKm * this.defaults.perKmRate)) * 1.0;
      return { totalFare: parseFloat(fallback.toFixed(2)), currency: 'LSL' };
    }
  }

  /**
   * Internal logic to determine surge pricing.
   * In a full implementation, this would check Redis for high demand in specific cells.
   */
  _getSurgeMultiplier() {
    const hour = new Date().getHours();
    const day = new Date().getDay(); // 0 is Sunday, 6 is Saturday

    let multiplier = 1.0;

    // Morning Rush (7 AM - 9 AM)
    if (hour >= 7 && hour <= 9) multiplier = 1.4;
    
    // Evening Rush (4 PM - 7 PM)
    if (hour >= 16 && hour <= 19) multiplier = 1.5;

    // Weekend Nights (10 PM - 3 AM)
    if ((day === 5 || day === 6) && (hour >= 22 || hour <= 3)) multiplier = 1.8;

    return multiplier;
  }

  /**
   * Calculates cancellation fee based on ride status and time elapsed
   */
  calculateCancellationFee(ride) {
    const timeElapsedSec = (new Date() - new Date(ride.createdAt)) / 1000;
    
    // Free cancellation within first 2 minutes
    if (timeElapsedSec < 120) return 0;
    
    return this.defaults.cancellationFee || 2.0;
  }
}

module.exports = new PricingService();