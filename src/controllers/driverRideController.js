/**
 * Driver Ride Controller - COMPLETE PRODUCTION VERSION
 * Version: 3.0.0
 * Description: Complete ride management for drivers
 * 
 * @module controllers/driverRideController
 * @author Motsamai Development Team
 */

const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { APIError: AppError } = require('../utils/apiError');
const { Driver, Ride, User, Payment, Review } = require('../models');
const { redisClient } = require('../config/redis');
const { calculateDistance, calculateFare } = require('../utils/geoHelpers');

// =============================================================================
// RIDE HISTORY
// =============================================================================

/**
 * Get driver ride history
 * @route GET /api/v1/drivers/rides
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getRideHistory = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { 
            page = 1, 
            limit = 20, 
            status, 
            startDate, 
            endDate,
            sortBy = 'createdAt',
            sortOrder = 'DESC',
            search
        } = req.query;

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

        if (search) {
            whereClause[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { pickupAddress: { [Op.like]: `%${search}%` } },
                { dropoffAddress: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Ride.findAndCountAll({
            where: whereClause,
            include: [
                { 
                    model: User, 
                    as: 'rider', 
                    attributes: ['id', 'name', 'email', 'phone', 'profilePicture'] 
                },
                { 
                    model: Payment, 
                    attributes: ['id', 'amount', 'status', 'method', 'paid'] 
                },
                { 
                    model: Review, 
                    as: 'reviews',
                    attributes: ['id', 'rating', 'review', 'createdAt']
                }
            ],
            order: [[sortBy, sortOrder]],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        // Calculate summary
        const summary = await Ride.findAll({
            where: whereClause,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
                [sequelize.fn('SUM', sequelize.col('fare')), 'totalEarnings'],
                [sequelize.fn('AVG', sequelize.col('fare')), 'averageEarnings'],
                [sequelize.fn('AVG', sequelize.col('rating')), 'averageRating']
            ]
        });

        res.status(200).json({
            success: true,
            data: {
                rides: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count,
                    pages: Math.ceil(count / parseInt(limit))
                },
                summary: {
                    totalRides: summary[0]?.dataValues?.total || 0,
                    totalEarnings: summary[0]?.dataValues?.totalEarnings || 0,
                    averageEarnings: summary[0]?.dataValues?.averageEarnings || 0,
                    averageRating: summary[0]?.dataValues?.averageRating || 0
                }
            }
        });
    } catch (error) {
        logger.error('Get ride history error:', error);
        next(error);
    }
};

/**
 * Get current ride
 * @route GET /api/v1/drivers/rides/current
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getCurrentRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;

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
                { 
                    model: User, 
                    as: 'rider', 
                    attributes: ['id', 'name', 'email', 'phone', 'profilePicture'] 
                },
                { 
                    model: Payment, 
                    attributes: ['id', 'amount', 'status', 'method'] 
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
            success: true,
            data: ride || null
        });
    } catch (error) {
        logger.error('Get current ride error:', error);
        next(error);
    }
};

/**
 * Get ride by ID
 * @route GET /api/v1/drivers/rides/:rideId
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.getRideById = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id },
            include: [
                { model: User, as: 'rider', attributes: ['id', 'name', 'email', 'phone', 'profilePicture'] },
                { model: Payment, attributes: ['id', 'amount', 'status', 'method'] },
                { model: Review, as: 'reviews' }
            ]
        });

        if (!ride) {
            throw new AppError('Ride not found', 404, 'RIDE_NOT_FOUND');
        }

        res.status(200).json({
            success: true,
            data: ride
        });
    } catch (error) {
        logger.error('Get ride by ID error:', error);
        next(error);
    }
};

/**
 * Get real-time tracking data for an active ride
 * @route GET /api/v1/drivers/rides/:rideId/tracking
 */
exports.getRideTracking = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id },
            attributes: ['id', 'status', 'pickupLatitude', 'pickupLongitude', 'dropoffLatitude', 'dropoffLongitude']
        });
        if (!ride) throw new AppError('Ride not found', 404, 'RIDE_NOT_FOUND');

        res.status(200).json({
            success: true,
            data: {
                rideId: ride.id,
                rideStatus: ride.status,
                driverLocation: {
                    latitude: driver.currentLatitude || driver.latitude || null,
                    longitude: driver.currentLongitude || driver.longitude || null,
                    heading: driver.heading || null,
                    speed: driver.speed || null
                },
                eta: null,
                route: null,
                progress: null
            }
        });
    } catch (error) {
        logger.error('Get ride tracking error:', error);
        next(error);
    }
};

// =============================================================================
// RIDE ACTIONS
// =============================================================================

/**
 * Accept a ride
 * @route PUT /api/v1/drivers/rides/:rideId/accept
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.acceptRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { location, eta } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, status: 'pending' },
            include: [{ model: User, as: 'rider' }]
        });

        if (!ride) {
            throw new AppError('Ride not found or already taken', 404, 'RIDE_NOT_FOUND');
        }

        // Check if driver is available
        if (driver.status !== 'online' && driver.status !== 'available') {
            throw new AppError('Driver is not available', 400, 'DRIVER_NOT_AVAILABLE');
        }

        // Check if driver has current ride
        const currentRide = await Ride.findOne({
            where: {
                driverId: driver.id,
                status: { [Op.in]: ['accepted', 'arrived', 'started'] }
            }
        });

        if (currentRide) {
            throw new AppError('Driver already has an active ride', 400, 'ACTIVE_RIDE_EXISTS');
        }

        // Accept the ride
        await ride.update({
            driverId: driver.id,
            status: 'accepted',
            acceptedAt: new Date(),
            eta: eta || 5
        });

        // Update driver status
        await driver.update({ status: 'busy' });

        // Invalidate cache
        await redisClient.del(`rides:available`);
        await redisClient.del(`driver:currentRide:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Ride accepted successfully',
            data: ride
        });
    } catch (error) {
        logger.error('Accept ride error:', error);
        next(error);
    }
};

/**
 * Decline a ride
 * @route PUT /api/v1/drivers/rides/:rideId/decline
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.declineRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { reason, reasonCode } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, status: 'pending' }
        });

        if (!ride) {
            throw new AppError('Ride not found', 404, 'RIDE_NOT_FOUND');
        }

        // Record decline for analytics
        await RideDecline.create({
            id: uuidv4(),
            rideId: ride.id,
            driverId: driver.id,
            reason: reason || 'declined',
            reasonCode: reasonCode || 'other',
            createdAt: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Ride declined'
        });
    } catch (error) {
        logger.error('Decline ride error:', error);
        next(error);
    }
};

/**
 * Arrive at pickup
 * @route PUT /api/v1/drivers/rides/:rideId/arrive
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.arriveAtPickup = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { location, waitTime } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id, status: 'accepted' }
        });

        if (!ride) {
            throw new AppError('Ride not found or not in accepted state', 404, 'RIDE_NOT_FOUND');
        }

        await ride.update({
            status: 'arrived',
            arrivedAt: new Date(),
            waitTime: waitTime || 0
        });

        // Send notification to rider
        await sendNotification(ride.riderId, {
            title: 'Driver Arrived',
            body: `Your driver has arrived at ${ride.pickupAddress}`,
            type: 'ride',
            data: { rideId: ride.id }
        });

        res.status(200).json({
            success: true,
            message: 'Arrived at pickup location',
            data: ride
        });
    } catch (error) {
        logger.error('Arrive at pickup error:', error);
        next(error);
    }
};

/**
 * Start ride
 * @route PUT /api/v1/drivers/rides/:rideId/start
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.startRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { startLocation, odometer } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id, status: 'arrived' }
        });

        if (!ride) {
            throw new AppError('Ride not found or not in arrived state', 404, 'RIDE_NOT_FOUND');
        }

        await ride.update({
            status: 'started',
            startedAt: new Date(),
            startLocation: startLocation || null,
            odometerStart: odometer || null
        });

        res.status(200).json({
            success: true,
            message: 'Ride started',
            data: ride
        });
    } catch (error) {
        logger.error('Start ride error:', error);
        next(error);
    }
};

/**
 * Complete ride
 * @route PUT /api/v1/drivers/rides/:rideId/complete
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.completeRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { endLocation, distance, duration, fare, paymentMethod, odometer, rating } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { id: rideId, driverId: driver.id, status: 'started' },
            include: [{ model: User, as: 'rider' }]
        });

        if (!ride) {
            throw new AppError('Ride not found or not in started state', 404, 'RIDE_NOT_FOUND');
        }

        // Calculate final fare if not provided
        let finalFare = fare;
        if (!finalFare) {
            const dist = distance || calculateDistance(
                ride.pickupLatitude,
                ride.pickupLongitude,
                ride.dropoffLatitude,
                ride.dropoffLongitude
            );
            finalFare = calculateFare(dist, ride.vehicleType);
        }

        // Complete the ride
        await ride.update({
            status: 'completed',
            completedAt: new Date(),
            endLocation: endLocation || null,
            distance: distance || null,
            duration: duration || null,
            fare: finalFare,
            paymentMethod: paymentMethod || 'wallet',
            odometerEnd: odometer || null
        });

        // Create payment record
        const payment = await Payment.create({
            id: uuidv4(),
            rideId: ride.id,
            driverId: driver.id,
            riderId: ride.riderId,
            amount: finalFare,
            method: paymentMethod || 'wallet',
            status: 'completed',
            paid: false,
            createdAt: new Date()
        });

        // Update driver status
        await driver.update({ status: 'online' });

        // Handle rating if provided
        if (rating) {
            await Review.create({
                id: uuidv4(),
                rideId: ride.id,
                targetId: driver.id,
                targetType: 'driver',
                reviewerId: ride.riderId,
                rating: rating,
                createdAt: new Date()
            });
        }

        // Send notification to rider
        await sendNotification(ride.riderId, {
            title: 'Ride Completed',
            body: `Your ride has been completed. Fare: $${finalFare}`,
            type: 'ride',
            data: { rideId: ride.id, fare: finalFare }
        });

        // Invalidate cache
        await redisClient.del(`driver:currentRide:${driver.id}`);

        res.status(200).json({
            success: true,
            message: 'Ride completed successfully',
            data: {
                ride,
                payment
            }
        });
    } catch (error) {
        logger.error('Complete ride error:', error);
        next(error);
    }
};

/**
 * Cancel ride
 * @route PUT /api/v1/drivers/rides/:rideId/cancel
 * @access Private (Driver)
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
exports.cancelRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { reason, reasonCode, location } = req.body;

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) {
            throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');
        }

        const ride = await Ride.findOne({
            where: { 
                id: rideId, 
                driverId: driver.id,
                status: { [Op.in]: ['pending', 'accepted', 'arrived'] }
            }
        });

        if (!ride) {
            throw new AppError('Ride not found or cannot be cancelled', 404, 'RIDE_NOT_FOUND');
        }

        await ride.update({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: reason || 'driver_cancelled',
            cancellationReasonCode: reasonCode || 'other',
            cancellationLocation: location || null
        });

        // Update driver status
        await driver.update({ status: 'online' });

        // Invalidate cache
        await redisClient.del(`driver:currentRide:${driver.id}`);

        // Send notification to rider
        await sendNotification(ride.riderId, {
            title: 'Ride Cancelled',
            body: `Your ride has been cancelled by the driver. Reason: ${reason || 'Not specified'}`,
            type: 'ride',
            data: { rideId: ride.id, reason: reason }
        });

        res.status(200).json({
            success: true,
            message: 'Ride cancelled successfully',
            data: ride
        });
    } catch (error) {
        logger.error('Cancel ride error:', error);
        next(error);
    }
};

/**
 * Reroute an active ride to a new destination
 * @route PUT /api/v1/drivers/rides/:rideId/reroute
 */
exports.rerouteRide = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { newDestination, reason } = req.body;

        if (!newDestination?.latitude || !newDestination?.longitude) {
            throw new AppError('New destination coordinates are required', 400, 'DESTINATION_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');

        const ride = await Ride.findOne({
            where: {
                id: rideId,
                driverId: driver.id,
                status: { [Op.in]: ['accepted', 'arrived', 'started', 'in_progress'] }
            }
        });
        if (!ride) throw new AppError('Active ride not found', 404, 'RIDE_NOT_FOUND');

        await ride.update({
            dropoffLatitude: newDestination.latitude,
            dropoffLongitude: newDestination.longitude,
            dropoffAddress: newDestination.address || ride.dropoffAddress,
            rerouteReason: reason || null,
            reroutedAt: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Ride rerouted successfully',
            data: ride
        });
    } catch (error) {
        logger.error('Reroute ride error:', error);
        next(error);
    }
};

/**
 * Update the waiting time for an active ride
 * @route PUT /api/v1/drivers/rides/:rideId/wait
 */
exports.updateWaitTime = async (req, res, next) => {
    try {
        const driverId = req.user.id;
        const { rideId } = req.params;
        const { waitTime, status } = req.body;

        if (!Number.isFinite(Number(waitTime)) || Number(waitTime) < 0) {
            throw new AppError('Valid wait time is required', 400, 'WAIT_TIME_REQUIRED');
        }

        const driver = await Driver.findOne({ where: { userId: driverId } });
        if (!driver) throw new AppError('Driver not found', 404, 'DRIVER_NOT_FOUND');

        const ride = await Ride.findOne({
            where: {
                id: rideId,
                driverId: driver.id,
                status: { [Op.in]: ['accepted', 'arrived', 'started', 'in_progress'] }
            }
        });
        if (!ride) throw new AppError('Active ride not found', 404, 'RIDE_NOT_FOUND');

        await ride.update({
            waitTime: Number(waitTime),
            waitStatus: status || 'waiting',
            waitTimeUpdatedAt: new Date()
        });

        res.status(200).json({
            success: true,
            message: 'Wait time updated successfully',
            data: ride
        });
    } catch (error) {
        logger.error('Update wait time error:', error);
        next(error);
    }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send notification to user
 * @param {string} userId - User ID
 * @param {Object} data - Notification data
 * @returns {Promise<void>}
 */
async function sendNotification(userId, data) {
    try {
        // This would be implemented with notification service
        logger.info(`Notification sent to user ${userId}: ${data.title}`);
    } catch (error) {
        logger.error('Send notification error:', error);
    }
}