/**
 * Driver Analytics Controller - Production Ready Version 1.0.0
 * Driver performance metrics, statistics, and insights
 * 
 * @module controllers/driverAnalyticsController
 * @version 1.0.0
 * @author Motsamai Development Team
 */

const { Driver, Ride, Review, AuditLog, Sequelize } = require('../models');
const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const { sendResponse } = require('../utils/response.util');
const { NotFoundError } = require('../utils/apiError');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const { CACHE_KEYS, CACHE_DURATIONS } = require('../utils/cacheKeys');

/**
 * Get comprehensive driver statistics
 * @route GET /api/v1/drivers/statistics
 * @access Private (Driver)
 */
exports.getStatistics = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { startDate, endDate } = req.query;

    const cacheKey = `${CACHE_KEYS.STATISTICS}:${userId}`;
    let cached = await cacheService.get(cacheKey);
    if (cached) return sendResponse(res, 200, cached, 'Statistics retrieved from cache');

    const driver = await Driver.findOne({ where: { user_id: userId } });
    if (!driver) throw new NotFoundError('Driver profile not found');

    const whereClause = { driver_id: driver.id };
    if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    const rideStats = await Ride.findAll({
        where: whereClause,
        attributes: [
            'status',
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
            [Sequelize.fn('SUM', Sequelize.col('fare_amount')), 'total_fare'],
            [Sequelize.fn('SUM', Sequelize.col('distance_km')), 'total_distance'],
        ],
        group: ['status'],
        raw: true,
        subQuery: false
    });

    const stats = {
        profile: {
            id: driver.id,
            name: driver.user?.name,
            email: driver.user?.email,
            phone: driver.phone,
            average_rating: parseFloat(driver.average_rating || 0),
            total_ratings: driver.total_ratings || 0,
            total_rides: driver.total_rides || 0,
            joined_date: driver.createdAt,
            verification_status: driver.verification_status
        },
        rides: rideStats.reduce((acc, stat) => {
            acc[stat.status] = {
                count: parseInt(stat.count || 0),
                total_fare: parseFloat(stat.total_fare || 0),
                total_distance: parseFloat(stat.total_distance || 0)
            };
            return acc;
        }, {}),
        vehicle: driver.Vehicle ? {
            license_plate: driver.Vehicle.license_plate,
            make: driver.Vehicle.make,
            model: driver.Vehicle.model,
            year: driver.Vehicle.year,
            status: driver.Vehicle.status
        } : null
    };

    await cacheService.set(cacheKey, stats, CACHE_DURATIONS.STATISTICS);
    logger.info(`Driver ${userId} statistics retrieved`);

    return sendResponse(res, 200, stats, 'Statistics retrieved successfully');
});

/**
 * Get driver performance statistics
 * @route GET /api/v1/drivers/statistics/performance
 * @access Private (Driver)
 */
exports.getPerformanceStats = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { days = 30 } = req.query;

    const driver = await Driver.findOne({ where: { user_id: userId } });
    if (!driver) throw new NotFoundError('Driver profile not found');

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rides = await Ride.findAll({
        where: {
            driver_id: driver.id,
            createdAt: { [Op.gte]: startDate }
        },
        attributes: ['id', 'fare_amount', 'distance_km', 'duration_minutes', 'status', 'completed_at'],
        raw: true
    });

    const completedRides = rides.filter(r => r.status === 'completed');
    const cancellationRate = rides.length > 0 ? 
        ((rides.filter(r => r.status === 'cancelled').length / rides.length) * 100).toFixed(2) : 0;

    const performance = {
        period_days: days,
        total_rides: rides.length,
        completed_rides: completedRides.length,
        cancelled_rides: rides.filter(r => r.status === 'cancelled').length,
        total_earnings: completedRides.reduce((sum, r) => sum + (r.fare_amount || 0), 0).toFixed(2),
        total_distance: completedRides.reduce((sum, r) => sum + (r.distance_km || 0), 0).toFixed(2),
        total_hours: (completedRides.reduce((sum, r) => sum + (r.duration_minutes || 0), 0) / 60).toFixed(2),
        average_fare: completedRides.length > 0 ?
            (completedRides.reduce((sum, r) => sum + (r.fare_amount || 0), 0) / completedRides.length).toFixed(2) : 0,
        average_rating: parseFloat(driver.average_rating || 0),
        acceptance_rate: rides.length > 0 ? 
            ((completedRides.length / rides.length) * 100).toFixed(2) : 0,
        cancellation_rate: parseFloat(cancellationRate)
    };

    logger.info(`Driver ${userId} performance stats retrieved`);
    return sendResponse(res, 200, performance, 'Performance statistics retrieved successfully');
});

/**
 * Get driver comparison statistics
 * @route GET /api/v1/drivers/statistics/comparison
 * @access Private (Driver)
 */
exports.getComparisonStats = asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    const { days = 30 } = req.query;

    const driver = await Driver.findOne({ where: { user_id: userId } });
    if (!driver) throw new NotFoundError('Driver profile not found');

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Driver's stats
    const driverRides = await Ride.findAll({
        where: {
            driver_id: driver.id,
            status: 'completed',
            createdAt: { [Op.gte]: startDate }
        },
        attributes: [
            [Sequelize.fn('AVG', Sequelize.col('fare_amount')), 'avg_fare'],
            [Sequelize.fn('AVG', Sequelize.col('duration_minutes')), 'avg_duration'],
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'ride_count']
        ],
        raw: true
    });

    // Platform average
    const platformStats = await Ride.findAll({
        where: {
            status: 'completed',
            createdAt: { [Op.gte]: startDate }
        },
        attributes: [
            [Sequelize.fn('AVG', Sequelize.col('fare_amount')), 'avg_fare'],
            [Sequelize.fn('AVG', Sequelize.col('duration_minutes')), 'avg_duration'],
            [Sequelize.fn('COUNT', Sequelize.col('id')), 'ride_count']
        ],
        raw: true
    });

    const comparison = {
        period_days: days,
        driver: {
            average_fare: parseFloat(driverRides[0]?.avg_fare || 0).toFixed(2),
            average_duration: parseFloat(driverRides[0]?.avg_duration || 0).toFixed(2),
            total_rides: parseInt(driverRides[0]?.ride_count || 0),
            rating: parseFloat(driver.average_rating || 0)
        },
        platform_average: {
            average_fare: parseFloat(platformStats[0]?.avg_fare || 0).toFixed(2),
            average_duration: parseFloat(platformStats[0]?.avg_duration || 0).toFixed(2),
            total_rides: parseInt(platformStats[0]?.ride_count || 0),
            rating: 4.5
        }
    };

    logger.info(`Driver ${userId} comparison stats retrieved`);
    return sendResponse(res, 200, comparison, 'Comparison statistics retrieved successfully');
});

/**
 * Get driver insights and recommendations
 * @route GET /api/v1/drivers/statistics/insights
 * @access Private (Driver)
 */
exports.getInsights = asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    const driver = await Driver.findOne({ where: { user_id: userId } });
    if (!driver) throw new NotFoundError('Driver profile not found');

    const insights = {
        optimization: [],
        performance: [],
        earnings: []
    };

    // Rating insights
    if (driver.average_rating < 4.5) {
        insights.optimization.push({
            category: 'rating',
            message: 'Your rating is below platform average. Consider improving service quality.',
            current: driver.average_rating,
            target: 4.7
        });
    }

    // Earnings insights
    const recentRides = await Ride.findAll({
        where: {
            driver_id: driver.id,
            status: 'completed',
            createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        },
        attributes: ['fare_amount'],
        order: [['createdAt', 'DESC']],
        limit: 10,
        raw: true
    });

    if (recentRides.length > 0) {
        const avgRecent = recentRides.reduce((sum, r) => sum + r.fare_amount, 0) / recentRides.length;
        insights.earnings.push({
            message: 'Weekly average: ' + avgRecent.toFixed(2),
            average: avgRecent.toFixed(2),
            rides: recentRides.length
        });
    }

    logger.info(`Driver ${userId} insights generated`);
    return sendResponse(res, 200, insights, 'Insights retrieved successfully');
});
