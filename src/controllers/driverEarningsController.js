/**
 * Driver Earnings Controller - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete earnings management for drivers
 * 
 * @module controllers/driverEarningsController
 * @author Motsamai Development Team
 */

const { v4: uuidv4 } = require('uuid');
const { Op, Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const { APIError: AppError } = require('../utils/apiError');
const { Driver, Payment, Ride, Payout, User } = require('../models');
const { redisClient } = require('../config/redis');

// =============================================================================
// GET EARNINGS
// =============================================================================

/**
 * Get driver earnings summary
 * @route GET /api/v1/drivers/earnings
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getEarnings = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { period = 'week', startDate, endDate, currency = 'USD', groupBy = 'day' } = req.query;

        // Get driver
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Calculate date range
        let dateRange = getDateRange(period);
        if (startDate && endDate) {
            dateRange = { start: new Date(startDate), end: new Date(endDate) };
        }

        const whereClause = {
            driverId: driver.id,
            status: 'completed',
            createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
        };

        // Get total earnings
        const total = await Payment.sum('amount', { where: whereClause });

        // Get earnings by day/week/month
        let groupByField;
        switch (groupBy) {
            case 'week':
                groupByField = Sequelize.fn('YEARWEEK', Sequelize.col('createdAt'));
                break;
            case 'month':
                groupByField = Sequelize.fn('DATE_FORMAT', Sequelize.col('createdAt'), '%Y-%m');
                break;
            default:
                groupByField = Sequelize.fn('DATE', Sequelize.col('createdAt'));
        }

        const byPeriod = await Payment.findAll({
            where: whereClause,
            attributes: [
                [groupByField, 'period'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: [groupByField],
            order: [[groupByField, 'ASC']]
        });

        // Get pending earnings
        const pending = await Payment.sum('amount', {
            where: {
                driverId: driver.id,
                status: 'pending'
            }
        });

        // Get paid earnings
        const paid = await Payment.sum('amount', {
            where: {
                driverId: driver.id,
                status: 'paid'
            }
        });

        // Get ride count
        const rideCount = await Ride.count({
            where: {
                driverId: driver.id,
                status: 'completed',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            }
        });

        // Get average per ride
        const average = rideCount > 0 ? total / rideCount : 0;

        // Get daily trend for chart
        const dailyTrend = await Payment.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
            limit: 30
        });

        // Get earnings breakdown by category
        const breakdown = await Payment.findAll({
            where: whereClause,
            attributes: [
                'type',
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: ['type']
        });

        const response = {
            period,
            dateRange,
            total: total || 0,
            pending: pending || 0,
            paid: paid || 0,
            average,
            rideCount,
            currency,
            chartData: dailyTrend.map(d => ({
                date: d.dataValues.date,
                amount: d.dataValues.amount || 0
            })),
            breakdown: breakdown.map(b => ({
                type: b.dataValues.type || 'ride',
                amount: b.dataValues.amount || 0,
                count: b.dataValues.count || 0
            })),
            byPeriod: byPeriod.map(b => ({
                period: b.dataValues.period,
                amount: b.dataValues.amount || 0,
                count: b.dataValues.count || 0
            }))
        };

        // Cache response
        await redisClient.setex(
            `driver:earnings:${driver.id}:${period}`,
            300,
            JSON.stringify(response)
        );

        res.status(200).json({
            success: true,
            data: response
        });
    } catch (error) {
        logger.error('Get earnings error:', error);
        next(error);
    }
};

/**
 * Get earnings chart data
 * @route GET /api/v1/drivers/earnings/chart
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getEarningsChart = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { period = 'week', chartType = 'line', limit = 30 } = req.query;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const dateRange = getDateRange(period);
        const whereClause = {
            driverId: driver.id,
            status: 'completed',
            createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
        };

        // Get daily earnings
        const dailyEarnings = await Payment.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
            limit: parseInt(limit)
        });

        // Get daily ride count
        const dailyRides = await Ride.findAll({
            where: {
                driverId: driver.id,
                status: 'completed',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            },
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
            limit: parseInt(limit)
        });

        // Combine data
        const data = {};
        dailyEarnings.forEach(d => {
            const date = d.dataValues.date;
            data[date] = { date, earnings: d.dataValues.amount || 0, rides: 0 };
        });

        dailyRides.forEach(d => {
            const date = d.dataValues.date;
            if (data[date]) {
                data[date].rides = d.dataValues.count || 0;
            } else {
                data[date] = { date, earnings: 0, rides: d.dataValues.count || 0 };
            }
        });

        const chartData = Object.values(data).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        const summary = {
            totalEarnings: chartData.reduce((sum, d) => sum + d.earnings, 0),
            totalRides: chartData.reduce((sum, d) => sum + d.rides, 0),
            averageEarnings: chartData.length > 0 
                ? chartData.reduce((sum, d) => sum + d.earnings, 0) / chartData.length 
                : 0
        };

        res.status(200).json({
            success: true,
            data: {
                labels: chartData.map(d => d.date),
                datasets: [
                    {
                        label: 'Earnings',
                        data: chartData.map(d => d.earnings),
                        type: chartType,
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Rides',
                        data: chartData.map(d => d.rides),
                        type: 'bar',
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        borderColor: 'rgba(153, 102, 255, 1)',
                        borderWidth: 1
                    }
                ],
                summary
            }
        });
    } catch (error) {
        logger.error('Get earnings chart error:', error);
        next(error);
    }
};

/**
 * Get earnings details
 * @route GET /api/v1/drivers/earnings/details
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getEarningsDetails = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { period = 'week', startDate, endDate, page = 1, limit = 50 } = req.query;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        let dateRange = getDateRange(period);
        if (startDate && endDate) {
            dateRange = { start: new Date(startDate), end: new Date(endDate) };
        }

        const whereClause = {
            driverId: driver.id,
            status: 'completed',
            createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
        };

        const { count, rows } = await Payment.findAndCountAll({
            where: whereClause,
            include: [
                { model: Ride, attributes: ['id', 'pickupAddress', 'dropoffAddress', 'distance', 'duration'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        // Get summary
        const summary = await Payment.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
                [Sequelize.fn('AVG', Sequelize.col('amount')), 'average'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ]
        });

        res.status(200).json({
            success: true,
            data: {
                transactions: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / parseInt(limit))
                },
                summary: {
                    total: summary[0]?.dataValues?.total || 0,
                    average: summary[0]?.dataValues?.average || 0,
                    count: summary[0]?.dataValues?.count || 0
                }
            }
        });
    } catch (error) {
        logger.error('Get earnings details error:', error);
        next(error);
    }
};

// =============================================================================
// PAYOUT MANAGEMENT
// =============================================================================

/**
 * Get payout history
 * @route GET /api/v1/drivers/earnings/payout-history
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getPayoutHistory = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { page = 1, limit = 20, status, method, startDate, endDate } = req.query;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const whereClause = { driverId: driver.id, type: 'payout' };

        if (status) {
            whereClause.status = status;
        }

        if (method) {
            whereClause.method = method;
        }

        if (startDate && endDate) {
            whereClause.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
        }

        const { count, rows } = await Payout.findAndCountAll({
            where: whereClause,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.status(200).json({
            success: true,
            data: {
                payouts: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / parseInt(limit))
                }
            }
        });
    } catch (error) {
        logger.error('Get payout history error:', error);
        next(error);
    }
};

/**
 * Request a payout
 * @route POST /api/v1/drivers/earnings/request-payout
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.requestPayout = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { amount, method, account, reference, notes } = req.body;

        if (!amount || amount <= 0) {
            throw new AppError('Valid amount required', 400, 'INVALID_AMOUNT');
        }

        if (!method) {
            throw new AppError('Payout method required', 400, 'METHOD_REQUIRED');
        }

        if (!account) {
            throw new AppError('Account details required', 400, 'ACCOUNT_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Check available balance
        const available = await Payment.sum('amount', {
            where: {
                driverId: driver.id,
                status: 'completed',
                paid: false
            }
        });

        if ((available || 0) < amount) {
            throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');
        }

        // Create payout request
        const payout = await Payout.create({
            id: uuidv4(),
            driverId: driver.id,
            amount: amount,
            method: method,
            account: account,
            reference: reference || `PO-${Date.now()}`,
            notes: notes || null,
            status: 'pending',
            createdAt: new Date()
        });

        // Mark payments as pending payout
        await Payment.update(
            { paid: true, payoutId: payout.id },
            {
                where: {
                    driverId: driver.id,
                    status: 'completed',
                    paid: false
                },
                limit: null
            }
        );

        res.status(201).json({
            success: true,
            message: 'Payout request submitted successfully',
            data: payout
        });
    } catch (error) {
        logger.error('Request payout error:', error);
        next(error);
    }
};

/**
 * Get payout methods
 * @route GET /api/v1/drivers/earnings/payout-methods
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getPayoutMethods = async (req, res, next) => {
    try {
        const driverId = req.user.id;

        const driver = await Driver.findOne({ 
            where: { userId: driverId },
            include: [{ model: PayoutMethod }]
        });

        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const methods = driver.PayoutMethods || [];

        res.status(200).json({
            success: true,
            data: methods
        });
    } catch (error) {
        logger.error('Get payout methods error:', error);
        next(error);
    }
};

/**
 * Add payout method
 * @route POST /api/v1/drivers/earnings/payout-methods
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.addPayoutMethod = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { method, details, isDefault } = req.body;

        if (!method) {
            throw new AppError('Method type required', 400, 'METHOD_REQUIRED');
        }

        if (!details) {
            throw new AppError('Method details required', 400, 'DETAILS_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // If setting as default, remove default from others
        if (isDefault) {
            await PayoutMethod.update(
                { isDefault: false },
                { where: { driverId: driver.id } }
            );
        }

        const payoutMethod = await PayoutMethod.create({
            id: uuidv4(),
            driverId: driver.id,
            method: method,
            details: details,
            isDefault: isDefault || false,
            createdAt: new Date()
        });

        res.status(201).json({
            success: true,
            message: 'Payout method added successfully',
            data: payoutMethod
        });
    } catch (error) {
        logger.error('Add payout method error:', error);
        next(error);
    }
};

/**
 * Remove payout method
 * @route DELETE /api/v1/drivers/earnings/payout-methods/:id
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.removePayoutMethod = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { id } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const method = await PayoutMethod.findOne({
            where: { id, driverId: driver.id }
        });

        if (!method) {
            throw new AppError('Payout method not found', 404, 'METHOD_NOT_FOUND');
        }

        // If this was the default, set another as default
        if (method.isDefault) {
            const another = await PayoutMethod.findOne({
                where: { driverId: driver.id, id: { [Op.ne]: id } }
            });
            if (another) {
                await another.update({ isDefault: true });
            }
        }

        await method.destroy();

        res.status(200).json({
            success: true,
            message: 'Payout method removed successfully'
        });
    } catch (error) {
        logger.error('Remove payout method error:', error);
        next(error);
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get date range for period
 * @param {string} period - Period string
 * @returns {Object} Date range
 */
function getDateRange(period) {
    const now = new Date();
    let start = new Date();

    switch (period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            break;
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            break;
        case 'week':
            start.setDate(start.getDate() - 7);
            break;
        case 'month':
            start.setMonth(start.getMonth() - 1);
            break;
        case 'year':
            start.setFullYear(start.getFullYear() - 1);
            break;
        default:
            start.setHours(0, 0, 0, 0);
    }

    return { start, end: now };
}