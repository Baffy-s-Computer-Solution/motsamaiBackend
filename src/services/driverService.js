/**
 * Driver Service - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete driver service with all business logic
 * 
 * @module services/driverService
 * @author Motsamai Development Team
 */

const { v4: uuidv4 } = require('uuid');
const { Op, Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const {
    sequelize,
    Driver,
    User,
    Ride,
    Vehicle,
    Document,
    Payment,
    Review,
    DriverStatus,
    Notification,
    DriverLocation,
} = require('../models');
const { redisClient } = require('../config/redis');

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

/**
 * Get driver profile
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Driver profile
 */
exports.getProfile = async (driverId) => {
    try {
        const driver = await Driver.findOne({
            where: { userId: driverId },
            include: [
                { model: User, attributes: ['id', 'name', 'email', 'phone', 'profilePicture'] },
                { model: Vehicle },
                { 
                    model: DriverStatus,
                    attributes: ['status', 'lastLocation', 'lastUpdated']
                }
            ]
        });

        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Get additional stats
        const rideStats = await Ride.count({
            where: { driverId: driver.id, status: 'completed' }
        });

        const earnings = await Payment.sum('amount', {
            where: { driverId: driver.id, status: 'completed' }
        });

        const avgRating = await Review.findOne({
            where: { targetId: driver.id, targetType: 'driver' },
            attributes: [[Sequelize.fn('AVG', Sequelize.col('rating')), 'average']]
        });

        return {
            ...driver.toJSON(),
            rideStats,
            earnings: earnings || 0,
            averageRating: avgRating?.dataValues?.average || 0,
            user: driver.User
        };
    } catch (error) {
        logger.error('Get profile error:', error);
        throw error;
    }
};

/**
 * Update driver profile
 * @param {string} driverId - Driver ID
 * @param {Object} updates - Profile updates
 * @returns {Promise<Object>} Updated profile
 */
exports.updateProfile = async (driverId, updates) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // Update user profile
        if (updates.name || updates.phone || updates.email) {
            await User.update(updates, { where: { id: driverId } });
        }

        // Update driver profile
        const allowedFields = ['bio', 'preferences', 'languages', 'address', 'emergencyContact'];
        const driverUpdates = {};
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                driverUpdates[field] = updates[field];
            }
        });

        await driver.update(driverUpdates);

        // Invalidate cache
        await invalidateCache(`driver:profile:${driverId}`);

        return driver.reload();
    } catch (error) {
        logger.error('Update profile error:', error);
        throw error;
    }
};

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get driver statistics
 * @param {string} driverId - Driver ID
 * @param {string} period - Period (today/week/month/year)
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Statistics
 */
exports.getStatistics = async (driverId, period = 'today', startDate = null, endDate = null) => {
    try {
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
            createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
        };

        // Get ride statistics
        const rides = await Ride.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total'],
                [Sequelize.fn('SUM', Sequelize.col('distance')), 'totalDistance'],
                [Sequelize.fn('AVG', Sequelize.col('distance')), 'averageDistance'],
                [Sequelize.fn('AVG', Sequelize.col('duration')), 'averageDuration']
            ]
        });

        const statusCounts = await Ride.findAll({
            where: whereClause,
            attributes: [
                'status',
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: ['status']
        });

        // Get revenue statistics
        const revenue = await Payment.findOne({
            where: {
                driverId: driver.id,
                status: 'completed',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            },
            attributes: [
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
                [Sequelize.fn('AVG', Sequelize.col('amount')), 'average'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ]
        });

        // Get rating statistics
        const ratings = await Review.findAll({
            where: {
                targetId: driver.id,
                targetType: 'driver',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            },
            attributes: [
                [Sequelize.fn('AVG', Sequelize.col('rating')), 'average'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
            ]
        });

        // Performance metrics
        const performance = await calculatePerformance(driver.id, dateRange);

        return {
            period: period,
            dateRange: dateRange,
            rideStats: {
                total: rides[0]?.dataValues?.total || 0,
                totalDistance: rides[0]?.dataValues?.totalDistance || 0,
                averageDistance: rides[0]?.dataValues?.averageDistance || 0,
                averageDuration: rides[0]?.dataValues?.averageDuration || 0,
                byStatus: statusCounts.map(s => ({ status: s.status, count: s.dataValues.count }))
            },
            revenueStats: {
                total: revenue?.dataValues?.total || 0,
                average: revenue?.dataValues?.average || 0,
                count: revenue?.dataValues?.count || 0
            },
            ratingStats: {
                average: ratings[0]?.dataValues?.average || 0,
                total: ratings[0]?.dataValues?.total || 0
            },
            performance: performance
        };
    } catch (error) {
        logger.error('Get statistics error:', error);
        throw error;
    }
};

// =============================================================================
// RIDE MANAGEMENT
// =============================================================================

/**
 * Get driver ride history
 * @param {string} driverId - Driver ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {string} status - Filter by status
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Paginated ride history
 */
exports.getRideHistory = async (driverId, page = 1, limit = 20, status = null, startDate = null, endDate = null) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const whereClause = { driverId: driver.id };
        
        if (status) {
            whereClause.status = status;
        }

        if (startDate && endDate) {
            whereClause.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
        }

        const { count, rows } = await Ride.findAndCountAll({
            where: whereClause,
            include: [
                { model: User, as: 'rider', attributes: ['id', 'name', 'email', 'phone'] },
                { model: Payment, attributes: ['amount', 'status', 'method'] }
            ],
            order: [['createdAt', 'DESC']],
            limit: limit,
            offset: (page - 1) * limit
        });

        // Calculate summary
        const summary = await Ride.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'total'],
                [Sequelize.fn('SUM', Sequelize.col('fare')), 'totalEarnings'],
                [Sequelize.fn('AVG', Sequelize.col('fare')), 'averageEarnings']
            ]
        });

        return {
            rides: rows,
            pagination: {
                page,
                limit,
                total: count,
                pages: Math.ceil(count / limit)
            },
            summary: {
                totalRides: summary[0]?.dataValues?.total || 0,
                totalEarnings: summary[0]?.dataValues?.totalEarnings || 0,
                averageEarnings: summary[0]?.dataValues?.averageEarnings || 0
            }
        };
    } catch (error) {
        logger.error('Get ride history error:', error);
        throw error;
    }
};

/**
 * Get current ride
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Current ride
 */
exports.getCurrentRide = async (driverId) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: {
                driverId: driver.id,
                status: { [Op.in]: ['pending', 'accepted', 'arrived', 'started'] }
            },
            include: [
                { model: User, as: 'rider', attributes: ['id', 'name', 'email', 'phone', 'profilePicture'] },
                { model: Payment, attributes: ['amount', 'status', 'method'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        return ride || null;
    } catch (error) {
        logger.error('Get current ride error:', error);
        throw error;
    }
};

/**
 * Get ride by ID
 * @param {string} driverId - Driver ID
 * @param {string} rideId - Ride ID
 * @returns {Promise<Object>} Ride details
 */
exports.getRideById = async (driverId, rideId) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id },
            include: [
                { model: User, as: 'rider', attributes: ['id', 'name', 'email', 'phone'] },
                { model: Payment },
                { model: Review, as: 'reviews' }
            ]
        });

        if (!ride) {
            throw new AppError('Ride not found', 404, 'RIDE_NOT_FOUND');
        }

        return ride;
    } catch (error) {
        logger.error('Get ride by ID error:', error);
        throw error;
    }
};

// =============================================================================
// STATUS MANAGEMENT
// =============================================================================

/**
 * Get driver status
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Driver status
 */
exports.getStatus = async (driverId) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const status = await DriverStatus.findOne({
            where: { driverId: driver.id },
            order: [['lastUpdated', 'DESC']]
        });

        return status || { status: 'offline', lastLocation: null, lastUpdated: new Date() };
    } catch (error) {
        logger.error('Get status error:', error);
        throw error;
    }
};

/**
 * Update driver status
 * @param {string} driverId - Driver ID
 * @param {string} status - Status (online/offline/busy/available)
 * @param {Object} location - Location data
 * @returns {Promise<Object>} Updated status
 */
exports.updateStatus = async (driverId, status, location = null) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const statusData = {
            driverId: driver.id,
            status: status,
            lastUpdated: new Date()
        };

        if (location) {
            statusData.lastLocation = {
                type: 'Point',
                coordinates: [location.longitude, location.latitude]
            };
        }

        const [statusRecord, created] = await DriverStatus.upsert(statusData, {
            returning: true
        });

        // Update driver status
        await driver.update({ status: status });

        // Invalidate cache
        await invalidateCache(`driver:status:${driverId}`);

        // Broadcast status change
        await broadcastStatusChange(driver.id, status);

        return statusRecord;
    } catch (error) {
        logger.error('Update status error:', error);
        throw error;
    }
};

// =============================================================================
// EARNINGS MANAGEMENT
// =============================================================================

/**
 * Get driver earnings
 * @param {string} driverId - Driver ID
 * @param {string} period - Period (day/week/month/year)
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Earnings summary
 */
exports.getEarnings = async (driverId, period = 'week', startDate = null, endDate = null) => {
    try {
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

        // Get earnings by day
        const byDay = await Payment.findAll({
            where: whereClause,
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'amount'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
            ],
            group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']]
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

        return {
            period: period,
            dateRange: dateRange,
            total: total || 0,
            pending: pending || 0,
            paid: paid || 0,
            byDay: byDay,
            average: byDay.length > 0 ? total / byDay.length : 0,
            count: byDay.length
        };
    } catch (error) {
        logger.error('Get earnings error:', error);
        throw error;
    }
};

/**
 * Request payout
 * @param {string} driverId - Driver ID
 * @param {number} amount - Amount to withdraw
 * @param {string} method - Payout method
 * @param {string} account - Account details
 * @param {string} reference - Reference ID
 * @param {string} notes - Additional notes
 * @returns {Promise<Object>} Payout request
 */
exports.requestPayout = async (driverId, amount, method, account, reference = null, notes = null) => {
    try {
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
        const payout = await Payment.create({
            id: uuidv4(),
            driverId: driver.id,
            amount: amount,
            method: method,
            account: account,
            reference: reference,
            notes: notes,
            type: 'payout',
            status: 'pending',
            createdAt: new Date()
        });

        return payout;
    } catch (error) {
        logger.error('Request payout error:', error);
        throw error;
    }
};

// =============================================================================
// VEHICLE MANAGEMENT
// =============================================================================

/**
 * Get driver vehicle
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Vehicle details
 */
exports.getVehicle = async (driverId) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const vehicle = await Vehicle.findOne({
            where: { driverId: driver.id },
            include: [
                { model: Document, as: 'documents' }
            ]
        });

        return vehicle || null;
    } catch (error) {
        logger.error('Get vehicle error:', error);
        throw error;
    }
};

/**
 * Update driver vehicle
 * @param {string} driverId - Driver ID
 * @param {Object} vehicleData - Vehicle data
 * @returns {Promise<Object>} Updated vehicle
 */
exports.updateVehicle = async (driverId, vehicleData) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const [vehicle, created] = await Vehicle.upsert({
            ...vehicleData,
            driverId: driver.id
        }, {
            returning: true
        });

        // Invalidate cache
        await invalidateCache(`driver:vehicle:${driverId}`);

        return vehicle;
    } catch (error) {
        logger.error('Update vehicle error:', error);
        throw error;
    }
};

// =============================================================================
// DOCUMENT MANAGEMENT
// =============================================================================

/**
 * Get driver documents
 * @param {string} driverId - Driver ID
 * @returns {Promise<Object>} Document list
 */
exports.getDocuments = async (driverId) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const documents = await Document.findAll({
            where: { driverId: driver.id },
            order: [['createdAt', 'DESC']]
        });

        // Summary
        const summary = {
            total: documents.length,
            verified: documents.filter(d => d.status === 'verified').length,
            pending: documents.filter(d => d.status === 'pending').length,
            rejected: documents.filter(d => d.status === 'rejected').length
        };

        return {
            documents,
            summary
        };
    } catch (error) {
        logger.error('Get documents error:', error);
        throw error;
    }
};

/**
 * Upload documents
 * @param {string} driverId - Driver ID
 * @param {Array} files - Uploaded files
 * @param {string} documentType - Document type
 * @returns {Promise<Object>} Uploaded documents
 */
exports.uploadDocuments = async (driverId, files, documentType = 'general') => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const uploaded = [];
        for (const file of files) {
            const document = await Document.create({
                id: uuidv4(),
                driverId: driver.id,
                type: documentType,
                name: file.originalname,
                url: file.location || file.path,
                size: file.size,
                mimeType: file.mimetype,
                status: 'pending',
                createdAt: new Date()
            });
            uploaded.push(document);
        }

        return uploaded;
    } catch (error) {
        logger.error('Upload documents error:', error);
        throw error;
    }
};

// =============================================================================
// LOCATION MANAGEMENT
// =============================================================================

/**
 * Update driver location
 * @param {string} driverId - Driver ID
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {number} accuracy - Accuracy in meters
 * @param {number} heading - Heading in degrees
 * @param {number} speed - Speed in m/s
 * @returns {Promise<Object>} Location update
 */
exports.updateLocation = async (driverId, latitude, longitude, accuracy = null, heading = null, speed = null) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const location = await DriverLocation.create({
            id: uuidv4(),
            driverId: driver.id,
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            heading: heading,
            speed: speed,
            timestamp: new Date()
        });

        // Update driver status location
        await DriverStatus.update({
            lastLocation: {
                type: 'Point',
                coordinates: [longitude, latitude]
            },
            lastUpdated: new Date()
        }, {
            where: { driverId: driver.id }
        });

        // Update Redis cache for real-time tracking
        await redisClient.setex(
            `driver:location:${driverId}`,
            60,
            JSON.stringify({ latitude, longitude, heading, speed, timestamp: new Date() })
        );

        return location;
    } catch (error) {
        logger.error('Update location error:', error);
        throw error;
    }
};

// =============================================================================
// AVAILABLE RIDES
// =============================================================================

/**
 * Get available rides near driver
 * @param {string} driverId - Driver ID
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @param {number} radius - Radius in km
 * @param {number} limit - Max results
 * @returns {Promise<Object>} Available rides
 */
exports.getAvailableRides = async (driverId, latitude, longitude, radius = 10, limit = 20) => {
    try {
        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        // If no location provided, get driver's last location
        if (!latitude || !longitude) {
            const status = await DriverStatus.findOne({
                where: { driverId: driver.id },
                order: [['lastUpdated', 'DESC']]
            });
            if (status?.lastLocation?.coordinates) {
                [longitude, latitude] = status.lastLocation.coordinates;
            }
        }

        // Find available rides
        const rides = await Ride.findAll({
            where: {
                status: 'pending',
                driverId: null,
                createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
            },
            include: [
                { model: User, as: 'rider', attributes: ['id', 'name', 'rating'] }
            ],
            limit: limit,
            order: [['createdAt', 'ASC']]
        });

        // Calculate distance and sort
        const ridesWithDistance = rides.map(ride => {
            const distance = calculateDistance(
                latitude,
                longitude,
                ride.pickupLatitude,
                ride.pickupLongitude
            );
            return {
                ...ride.toJSON(),
                distance: distance,
                estimatedPickupTime: Math.ceil(distance / 30) // Assuming 30 km/h average
            };
        });

        ridesWithDistance.sort((a, b) => a.distance - b.distance);

        return ridesWithDistance;
    } catch (error) {
        logger.error('Get available rides error:', error);
        throw error;
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

/**
 * Calculate distance between two points (Haversine formula)
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Calculate driver performance metrics
 * @param {string} driverId - Driver ID
 * @param {Object} dateRange - Date range
 * @returns {Promise<Object>} Performance metrics
 */
async function calculatePerformance(driverId, dateRange) {
    try {
        const totalRides = await Ride.count({
            where: {
                driverId: driverId,
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            }
        });

        const acceptedRides = await Ride.count({
            where: {
                driverId: driverId,
                status: { [Op.in]: ['accepted', 'started', 'completed'] },
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            }
        });

        const completedRides = await Ride.count({
            where: {
                driverId: driverId,
                status: 'completed',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            }
        });

        const cancelledRides = await Ride.count({
            where: {
                driverId: driverId,
                status: 'cancelled',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            }
        });

        // Calculate response time
        const responseTimes = await Ride.findAll({
            where: {
                driverId: driverId,
                status: 'accepted',
                createdAt: { [Op.between]: [dateRange.start, dateRange.end] }
            },
            attributes: ['createdAt', 'acceptedAt']
        });

        let avgResponseTime = 0;
        if (responseTimes.length > 0) {
            const totalTime = responseTimes.reduce((sum, ride) => {
                if (ride.acceptedAt) {
                    return sum + (new Date(ride.acceptedAt) - new Date(ride.createdAt));
                }
                return sum;
            }, 0);
            avgResponseTime = totalTime / responseTimes.length / 1000; // In seconds
        }

        return {
            totalRides,
            acceptedRides,
            completedRides,
            cancelledRides,
            acceptanceRate: totalRides > 0 ? (acceptedRides / totalRides) * 100 : 0,
            completionRate: acceptedRides > 0 ? (completedRides / acceptedRides) * 100 : 0,
            cancellationRate: totalRides > 0 ? (cancelledRides / totalRides) * 100 : 0,
            averageResponseTime: avgResponseTime,
            utilization: calculateUtilization(driverId, dateRange)
        };
    } catch (error) {
        logger.error('Calculate performance error:', error);
        return {};
    }
}

/**
 * Calculate driver utilization
 * @param {string} driverId - Driver ID
 * @param {Object} dateRange - Date range
 * @returns {Promise<number>} Utilization percentage
 */
async function calculateUtilization(driverId, dateRange) {
    try {
        // Get total online time
        const statuses = await DriverStatus.findAll({
            where: {
                driverId: driverId,
                status: 'online',
                lastUpdated: { [Op.between]: [dateRange.start, dateRange.end] }
            },
            attributes: ['createdAt', 'lastUpdated']
        });

        let totalOnlineTime = 0;
        for (const status of statuses) {
            const start = new Date(status.createdAt);
            const end = status.lastUpdated || new Date();
            totalOnlineTime += (end - start) / 1000; // In seconds
        }

        const totalTime = (dateRange.end - dateRange.start) / 1000; // In seconds
        return totalTime > 0 ? (totalOnlineTime / totalTime) * 100 : 0;
    } catch (error) {
        logger.error('Calculate utilization error:', error);
        return 0;
    }
}

/**
 * Invalidate cache
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
async function invalidateCache(key) {
    try {
        await redisClient.del(key);
    } catch (error) {
        logger.error('Invalidate cache error:', error);
    }
}

/**
 * Broadcast status change
 * @param {string} driverId - Driver ID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
async function broadcastStatusChange(driverId, status) {
    try {
        // This would be implemented with Socket.io
        // For now, just log
        logger.info(`Driver ${driverId} status changed to ${status}`);
    } catch (error) {
        logger.error('Broadcast status change error:', error);
    }
}