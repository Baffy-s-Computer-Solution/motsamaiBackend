const analyticsService = require('../services/analyticsService');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const { User, Driver, Ride, Payment, sequelize } = require('../models');
const { Op, Sequelize } = require('sequelize');

/**
 * AnalyticsController - Detailed insights for administrators
 */
exports.summary = asyncHandler(async (req, res) => {
  const stats = await analyticsService.getDashboardStats();
  return sendResponse(res, 200, stats, 'Analytics summary fetched.');
});

exports.getDashboardAnalytics = asyncHandler(async (req, res) => {
  const stats = await analyticsService.getDashboardStats();
  return sendResponse(res, 200, stats);
});

exports.getRideAnalytics = asyncHandler(async (req, res) => {
  const where = buildDateWhere(req.query);
  const [total, byStatus, revenue] = await Promise.all([
    Ride.count({ where }),
    Ride.findAll({
      where,
      attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    Ride.sum('fare_amount', { where: { ...where, status: 'completed' } }),
  ]);
  return sendResponse(res, 200, { total, byStatus, completedRevenue: Number(revenue || 0) });
});

exports.getFinancialAnalytics = asyncHandler(async (req, res) => {
  const where = buildDateWhere(req.query);
  const payments = await Payment.findAll({
    where,
    attributes: [
      'status',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
      [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
    ],
    group: ['status'],
    raw: true,
  });
  return sendResponse(res, 200, { payments });
});

exports.getSurgePricingAnalytics = asyncHandler(async (req, res) => {
  const where = buildDateWhere(req.query);
  const requested = await Ride.count({ where: { ...where, status: 'requested' } });
  const activeDrivers = await Driver.count({ where: { is_available: true } });
  const demandRatio = activeDrivers ? requested / activeDrivers : requested;
  return sendResponse(res, 200, {
    requestedRides: requested,
    activeDrivers,
    demandRatio,
    surgeRecommended: demandRatio > 3,
  });
});

exports.getUserAnalytics = asyncHandler(async (req, res) => {
  const where = buildDateWhere(req.query);
  const [users, drivers, activeUsers] = await Promise.all([
    User.count({ where }),
    Driver.count(),
    User.count({ where: { ...where, is_active: true } }),
  ]);
  return sendResponse(res, 200, { users, activeUsers, drivers });
});

exports.getUserRetentionAnalytics = asyncHandler(async (req, res) => {
  const totalUsers = await User.count();
  const activeUsers = await User.count({ where: { is_active: true } });
  return sendResponse(res, 200, {
    totalUsers,
    activeUsers,
    activeRate: totalUsers ? activeUsers / totalUsers : 0,
  });
});

exports.getDriverAnalytics = asyncHandler(async (req, res) => {
  const [total, available, verified] = await Promise.all([
    Driver.count(),
    Driver.count({ where: { is_available: true } }),
    Driver.count({ where: { verification_status: 'verified' } }),
  ]);
  return sendResponse(res, 200, { total, available, verified });
});

exports.getRevenueBreakdown = asyncHandler(async (req, res) => {
  const where = buildDateWhere(req.query);
  const rows = await Payment.findAll({
    where,
    attributes: ['provider', [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
    group: ['provider'],
    raw: true,
  });
  return sendResponse(res, 200, rows);
});

exports.getGeographicAnalytics = asyncHandler(async (req, res) => {
  const rows = await Ride.findAll({
    attributes: [
      'pickup_address',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
    ],
    group: ['pickup_address'],
    order: [[sequelize.literal('count'), 'DESC']],
    limit: 20,
    raw: true,
  });
  return sendResponse(res, 200, rows);
});

exports.getTopPerformers = asyncHandler(async (req, res) => {
  const rows = await Ride.findAll({
    attributes: [
      'driver_id',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'completedRides'],
      [Sequelize.fn('SUM', Sequelize.col('fare_amount')), 'revenue'],
    ],
    where: { driver_id: { [Op.ne]: null }, status: 'completed' },
    group: ['driver_id'],
    order: [[sequelize.literal('"completedRides"'), 'DESC']],
    limit: 20,
    raw: true,
  });
  return sendResponse(res, 200, rows);
});

exports.getDemandPrediction = asyncHandler(async (req, res) => {
  const recentRequested = await Ride.count({
    where: { created_at: { [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  return sendResponse(res, 200, { horizonMinutes: 60, recentRequested, predictedDemand: recentRequested });
});

exports.getETAPrediction = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, { etaMinutes: null, message: 'ETA prediction requires live mapping integration' });
});

const buildDateWhere = (query = {}) => {
  const where = {};
  if (query.startDate || query.endDate) {
    where.created_at = {};
    if (query.startDate) where.created_at[Op.gte] = new Date(query.startDate);
    if (query.endDate) where.created_at[Op.lte] = new Date(query.endDate);
  }
  return where;
};
