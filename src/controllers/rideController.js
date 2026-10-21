const rideService = require('../services/rideService');
const pricingService = require('../services/pricingService');
const fraudDetectionService = require('../services/fraudDetection.service');
const trackingService = require('../services/trackingService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { Ride, Payment, Review, Promotion, sequelize } = require('../models');
const { Op } = require('sequelize');
const isDatabaseUnavailable = require('../utils/isDatabaseUnavailable');
const { listRiderRecords } = require('../services/firestoreRiderRecordService');

const emitRideUpdate = (req, ride, event = 'ride_update') => {
  const io = req.app.get('io');
  if (!io || !ride) return;

  const payload = {
    ride,
    rideId: ride.id,
    status: ride.status,
    driverId: ride.driver_id,
    riderId: ride.rider_id,
    updatedAt: ride.updated_at || ride.updatedAt || new Date(),
  };

  io.to(`ride:${ride.id}`).emit(event, payload);
  io.to('admin:rides').emit('ride_update', payload);
  if (ride.driver_id) {
    io.to(`driver:${ride.driver_id}`).emit('ride_update', payload);
  }
};

exports.create = asyncHandler(async (req, res) => {
  const ride = await rideService.create({ 
    ...req.body, 
    rider_id: req.user.id 
  });
  emitRideUpdate(req, ride, 'new_ride');
  return ok(res, ride, 'Ride created.', 201);
});

exports.instantBook = asyncHandler(async (req, res) => {
  // 1. Check for fraud/suspicious behavior
  const fraudCheck = await fraudDetectionService.analyzeRideRequest(req.user.id, req.body);
  if (!fraudCheck.isAllowed) {
    return res.status(403).json({ success: false, message: 'Request flagged as high risk' });
  }

  const ride = await rideService.create({ 
    ...req.body, 
    rider_id: req.user.id,
    status: 'searching'
  });
  emitRideUpdate(req, ride, 'new_ride');
  return ok(res, ride, 'Instant booking initiated.', 201);
});

exports.quickBook = exports.instantBook;

exports.getEstimate = asyncHandler(async (req, res) => {
  const estimate = await pricingService.calculateFare(req.body);
  return ok(res, estimate, 'Estimate calculated.');
});

exports.getRideById = asyncHandler(async (req, res) => {
  const ride = await rideService.getById(req.params.id);
  return ok(res, ride, 'Ride details fetched.');
});

exports.getRideHistory = asyncHandler(async (req, res) => {
  let history;
  try {
    history = await rideService.getRiderHistory(req.user.id);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;

    const firebaseUid = req.user.firebase_uid || req.user.id;
    const records = await listRiderRecords(firebaseUid, 'booking');
    history = records
      .filter((record) => record.payload?.serviceType !== 'logistics')
      .map((record) => {
        const payload = record.payload || {};
        return {
          ...payload,
          id: record.id,
          rider_id: record.firebase_uid,
          pickup_address: payload.pickup?.address || payload.pickup_address || null,
          pickup_lat: payload.pickup?.lat ?? payload.pickup_lat ?? null,
          pickup_lng: payload.pickup?.lng ?? payload.pickup_lng ?? null,
          dropoff_address: payload.destination?.address || payload.dropoff_address || null,
          dropoff_lat: payload.destination?.lat ?? payload.dropoff_lat ?? null,
          dropoff_lng: payload.destination?.lng ?? payload.dropoff_lng ?? null,
          fare_amount: payload.fare ?? payload.fare_amount ?? payload.estimatedFare ?? null,
          distance_km: payload.fareSnapshot?.distanceKm ?? payload.distance_km ?? null,
          vehicle_type: payload.transportMode || payload.vehicle_type || null,
          payment_method: payload.paymentMethod || payload.payment_method || null,
          status: record.status,
          createdAt: record.created_at,
          updatedAt: record.source_updated_at,
        };
      });
  }
  return ok(res, history, 'Ride history fetched.');
});

exports.getActiveRide = asyncHandler(async (req, res) => {
  let ride;
  try {
    ride = await Ride.findOne({
      where: {
        rider_id: req.user.id,
        status: { [Op.in]: ['requested', 'searching', 'accepted', 'arrived', 'picked_up', 'in_progress'] },
      },
      order: [['updated_at', 'DESC']],
    });
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const firebaseUid = req.user.firebase_uid || req.user.id;
    const bookings = await listRiderRecords(firebaseUid, 'booking');
    const activeBooking = bookings.find((record) => (
      ['searching', 'requested', 'accepted', 'arrived', 'picked_up', 'in_progress'].includes(record.status)
    ));
    ride = activeBooking
      ? {
          id: activeBooking.id,
          rider_id: activeBooking.firebase_uid,
          ...activeBooking.payload,
          status: activeBooking.status,
          createdAt: activeBooking.created_at,
          updatedAt: activeBooking.source_updated_at,
        }
      : null;
  }

  if (!ride) return ok(res, null, 'No active ride.');
  return ok(res, ride, 'Active ride fetched.');
});

exports.updateRideStatus = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, req.body.status);
  emitRideUpdate(req, ride);
  return ok(res, ride, 'Ride status updated.');
});

exports.acceptRide = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, 'accepted', req.user.id);
  emitRideUpdate(req, ride, 'driver_assigned');
  return ok(res, ride, 'Ride accepted.');
});

exports.arriveRide = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, 'arrived');
  emitRideUpdate(req, ride, 'driver_arrived');
  return ok(res, ride, 'Driver arrived.');
});

exports.startRide = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, 'picked_up');
  emitRideUpdate(req, ride, 'ride_started');
  return ok(res, ride, 'Ride started.');
});

exports.cancelRide = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, 'cancelled');
  emitRideUpdate(req, ride, 'ride_cancelled');
  return ok(res, ride, 'Ride cancelled.');
});

exports.completeRide = asyncHandler(async (req, res) => {
  const ride = await rideService.updateRideStatus(req.params.id, 'completed');
  emitRideUpdate(req, ride, 'ride_completed');
  return ok(res, ride, 'Ride completed.');
});

exports.getTrackingInfo = asyncHandler(async (req, res) => {
  const tracking = await trackingService.getDriverLocation(req.params.id);
  return ok(res, tracking, 'Tracking info fetched.');
});

exports.getRouteDetails = asyncHandler(async (req, res) => {
  const route = await rideService.getRouteDetails(req.params.id);
  return ok(res, route, 'Route details fetched.');
});

exports.getPaymentDetails = asyncHandler(async (req, res) => {
  const ride = await Ride.findByPk(req.params.id);
  if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

  const payments = await Payment.findAll({
    where: { ride_id: req.params.id },
    order: [['created_at', 'DESC']],
  });

  return ok(res, { ride, payments }, 'Payment details fetched.');
});

exports.processPayment = asyncHandler(async (req, res) => {
  const ride = await Ride.findByPk(req.params.id);
  if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

  const amount = req.body.amount || ride.fare_amount;
  if (!amount) {
    return res.status(400).json({ success: false, message: 'Payment amount is required' });
  }

  const payment = await Payment.create({
    ride_id: ride.id,
    user_id: ride.rider_id,
    provider: req.body.paymentMethod || req.body.provider || 'wallet',
    provider_ref: req.body.providerRef || null,
    amount,
    currency: req.body.currency || 'USD',
    status: req.body.status || 'pending',
  });

  return ok(res, payment, 'Payment created.', 201);
});

exports.rateRide = asyncHandler(async (req, res) => {
  const ride = await Ride.findByPk(req.params.id);
  if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });

  const reviewerId = req.user && req.user.id ? req.user.id : req.body.reviewerId;
  const revieweeId = req.body.revieweeId || req.body.targetId;
  if (!reviewerId || !revieweeId) {
    return res.status(400).json({ success: false, message: 'reviewerId and revieweeId are required' });
  }

  const review = await Review.create({
    ride_id: ride.id,
    reviewer_id: reviewerId,
    reviewee_id: revieweeId,
    rating: req.body.rating,
    comment: req.body.review || req.body.comment || null,
  });

  return ok(res, review, 'Ride rating submitted.', 201);
});

exports.getRideReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.findAll({
    where: { ride_id: req.params.id },
    order: [['created_at', 'DESC']],
  });
  return ok(res, reviews, 'Ride reviews fetched.');
});

exports.createRecurringRide = asyncHandler(async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Recurring rides are not available until the recurring ride schema is deployed',
  });
});

exports.getRecurringRides = asyncHandler(async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Recurring rides are not available until the recurring ride schema is deployed',
  });
});

exports.updateRecurringRide = asyncHandler(async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Recurring rides are not available until the recurring ride schema is deployed',
  });
});

exports.cancelRecurringRide = asyncHandler(async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Recurring rides are not available until the recurring ride schema is deployed',
  });
});

exports.getAvailablePromotions = asyncHandler(async (req, res) => {
  const now = new Date();
  const promotions = await Promotion.findAll({
    where: {
      is_active: true,
      [Op.and]: [
        { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
      ],
    },
    order: [['created_at', 'DESC']],
  });

  return ok(res, promotions, 'Available promotions fetched.');
});

exports.applyPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findOne({
    where: {
      code: req.body.code,
      is_active: true,
    },
  });

  if (!promotion) {
    return res.status(404).json({ success: false, message: 'Promotion not found or inactive' });
  }

  let ride = null;
  if (req.body.rideId) {
    ride = await Ride.findByPk(req.body.rideId);
    if (!ride) return res.status(404).json({ success: false, message: 'Ride not found' });
  }

  const baseAmount = Number(req.body.amount || (ride && ride.fare_amount) || 0);
  const discountValue = Number(promotion.discount_value);
  const discountAmount = promotion.discount_type === 'percent'
    ? (baseAmount * discountValue) / 100
    : discountValue;
  const finalAmount = Math.max(baseAmount - discountAmount, 0);

  return ok(res, {
    promotion,
    rideId: req.body.rideId || null,
    originalAmount: baseAmount,
    discountAmount,
    finalAmount,
  }, 'Promotion applied.');
});

exports.getRideStatistics = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.startDate || req.query.endDate) {
    where.created_at = {};
    if (req.query.startDate) where.created_at[Op.gte] = new Date(req.query.startDate);
    if (req.query.endDate) where.created_at[Op.lte] = new Date(req.query.endDate);
  }

  const [total, byStatus, revenue] = await Promise.all([
    Ride.count({ where }),
    Ride.findAll({
      where,
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    Ride.sum('fare_amount', { where: { ...where, status: 'completed' } }),
  ]);

  return ok(res, {
    total,
    byStatus,
    completedRevenue: Number(revenue || 0),
  }, 'Ride statistics fetched.');
});
