const { User, Driver, Ride, Payment } = require('../models');
const { Op, Sequelize } = require('sequelize');

/**
 * AnalyticsService - Business logic for system analytics and dashboard metrics
 */
class AnalyticsService {
  /**
   * Aggregates high-level metrics for the Admin Dashboard
   */
  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsers, activeDrivers, liveRides, todayRevenue, monthlyRevenue] = await Promise.all([
      User.count(),
      Driver.count({ where: { is_online: true } }),
      Ride.count({ where: { status: { [Op.in]: ['accepted', 'arrived', 'picked_up'] } } }),
      Payment.sum('amount', { 
        where: { 
          status: 'COMPLETED', 
          createdAt: { [Op.gte]: today } 
        } 
      }),
      Payment.sum('amount', {
        where: {
          status: 'COMPLETED',
          createdAt: { [Op.gte]: new Date(today.getFullYear(), today.getMonth(), 1) }
        }
      })
    ]);

    return {
      totalUsers,
      activeDrivers,
      liveRides,
      todayRevenue: parseFloat(todayRevenue || 0),
      monthlyRevenue: parseFloat(monthlyRevenue || 0),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Fetches user-specific ride statistics
   */
  async getUserRideStats(userId) {
    return await Ride.count({ where: { rider_id: userId } });
  }

  /**
   * Get specific ride performance metrics
   */
  async getRideAnalytics(filters) {
    const where = { status: 'completed' };
    if (filters.startDate && filters.endDate) {
      where.created_at = { [Op.between]: [filters.startDate, filters.endDate] };
    }

    const stats = await Ride.findAll({
      where,
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'totalRides'],
        [Sequelize.fn('AVG', Sequelize.col('fare_amount')), 'averageFare'],
        [Sequelize.literal("COUNT(CASE WHEN status = 'cancelled' THEN 1 END)"), 'cancelledRides']
      ],
      raw: true
    });

    return {
      summary: stats[0],
      period: filters.period || 'custom'
    };
  }
}

module.exports = new AnalyticsService();