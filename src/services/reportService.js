const { Ride, Payment, Report } = require('../models');
const reportRepository = require('../repositories/report.repository');
const { Op } = require('sequelize');

class ReportService {
  constructor() {
    this.repository = reportRepository;
  }

  /**
   * Generates a weekly analytics report for rides and revenue
   */
  async getWeeklyPerformanceReport() {
    const now = new Date();
    const startOfCurrentWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    
    const startOfLastWeek = new Date(startOfCurrentWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const [currentStats, previousStats] = await Promise.all([
      this._getStatsForPeriod(startOfCurrentWeek, new Date()),
      this._getStatsForPeriod(startOfLastWeek, startOfCurrentWeek)
    ]);

    return {
      period: {
        start: startOfCurrentWeek,
        end: new Date()
      },
      metrics: {
        revenue: {
          current: parseFloat(currentStats.revenue || 0),
          previous: parseFloat(previousStats.revenue || 0),
          growth: this._calculateGrowth(currentStats.revenue, previousStats.revenue)
        },
        rides: {
          current: parseInt(currentStats.rideCount || 0),
          previous: parseInt(previousStats.rideCount || 0),
          growth: this._calculateGrowth(currentStats.rideCount, previousStats.rideCount)
        },
        averageFare: {
          current: currentStats.rideCount > 0 ? (currentStats.revenue / currentStats.rideCount).toFixed(2) : 0,
          previous: previousStats.rideCount > 0 ? (previousStats.revenue / previousStats.rideCount).toFixed(2) : 0
        }
      }
    };
  }

  async _getStatsForPeriod(startDate, endDate) {
    const stats = await Ride.findOne({
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('Ride.id')), 'rideCount'],
        [Sequelize.fn('SUM', Sequelize.col('Payments.amount')), 'revenue']
      ],
      include: [{
        model: Payment,
        attributes: [],
        where: { status: 'COMPLETED' },
        required: false
      }],
      where: {
        created_at: {
          [Op.between]: [startDate, endDate]
        },
        status: 'completed'
      },
      raw: true
    });
    return stats;
  }

  _calculateGrowth(current, previous) {
    current = parseFloat(current || 0);
    previous = parseFloat(previous || 0);
    if (previous === 0) return current > 0 ? 100 : 0;
    return parseFloat((((current - previous) / previous) * 100).toFixed(2));
  }

  async exportWeeklyRevenueCsv() {
    // Implementation for CSV generation logic here
    // Using libraries like json2csv to format the ride and payment data
  }
}

module.exports = new ReportService();
