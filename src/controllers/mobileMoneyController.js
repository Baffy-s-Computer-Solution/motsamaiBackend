const mpesaService = require('../services/mpesa.service');
const ecocashService = require('../services/ecocash.service');
const asyncHandler = require('../utils/asyncHandler');
const { ApiResponse } = require('../utils/apiResponse');
const { ApiError } = require('../utils/apiError');
const { Payment, Ride, User } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Production Payment Controller handling Lesotho Mobile Money
 */

// List all payments (with optional filters)
exports.list = asyncHandler(async (req, res, next) => {
  const { status, provider, ride_id, page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const where = {};
  if (status) where.status = status;
  if (provider) where.provider = provider;
  if (ride_id) where.ride_id = ride_id;
  
  // If user is not admin, only show their own payments
  if (req.user.role !== 'admin') {
    const rides = await Ride.findAll({ 
      where: { rider_id: req.user.id },
      attributes: ['id']
    });
    const rideIds = rides.map(r => r.id);
    where.ride_id = { [Op.in]: rideIds };
  }
  
  const { count, rows } = await Payment.findAndCountAll({
    where,
    include: [
      { model: Ride, as: 'ride', attributes: ['id', 'pickup_address', 'dropoff_address', 'status'] }
    ],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset
  });
  
  return res.status(200).json(new ApiResponse(200, {
    payments: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / parseInt(limit))
    }
  }, 'Payments retrieved successfully'));
});

// Create a new payment (direct record)
exports.create = asyncHandler(async (req, res, next) => {
  const { ride_id, amount, provider, transaction_id, status = 'PENDING', payment_method } = req.body;
  
  // Verify the ride belongs to the user (if not admin)
  if (req.user.role !== 'admin') {
    const ride = await Ride.findOne({
      where: { id: ride_id, rider_id: req.user.id }
    });
    if (!ride) {
      throw new ApiError(404, 'Ride not found or unauthorized', 'RIDE_NOT_FOUND');
    }
  }
  
  const payment = await Payment.create({
    ride_id,
    amount,
    provider: provider || payment_method,
    transaction_id: transaction_id || `TXN-${Date.now()}`,
    status,
    user_id: req.user.id
  });
  
  logger.info(`Payment created: ${payment.id}`, { paymentId: payment.id, userId: req.user.id });
  
  return res.status(201).json(new ApiResponse(201, payment, 'Payment created successfully'));
});

// Get payment by ID
exports.getPaymentById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const payment = await Payment.findByPk(id, {
    include: [
      { model: Ride, as: 'ride' },
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
    ]
  });
  
  if (!payment) {
    throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  }
  
  // Check authorization
  if (req.user.role !== 'admin' && payment.user_id !== req.user.id) {
    throw new ApiError(403, 'Unauthorized to view this payment', 'UNAUTHORIZED');
  }
  
  return res.status(200).json(new ApiResponse(200, payment, 'Payment retrieved successfully'));
});

// Update payment status
exports.updatePaymentStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status || !['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(status)) {
    throw new ApiError(400, 'Invalid status value', 'INVALID_STATUS');
  }
  
  const payment = await Payment.findByPk(id);
  
  if (!payment) {
    throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  }
  
  await payment.update({ status });
  
  logger.info(`Payment status updated: ${id} to ${status}`);
  
  return res.status(200).json(new ApiResponse(200, payment, 'Payment status updated successfully'));
});

// Initiate mobile payment (M-Pesa or EcoCash)
exports.initiateMobilePayment = asyncHandler(async (req, res, next) => {
  const { provider, phoneNumber, amount, reference, ride_id } = req.body;
  let transactionId = `TXN-${Date.now()}`;
  const userId = req.user.id;

  // Validate required fields
  if (!provider || !phoneNumber || !amount) {
    throw new ApiError(400, 'Provider, phoneNumber and amount are required', 'MISSING_FIELDS');
  }

  let result;
  if (provider.toUpperCase() === 'MPESA') {
    result = await mpesaService.stkPush({
      phoneNumber,
      amount,
      accountReference: reference || 'MOT-TRIP',
      transactionDesc: `Payment for User ${userId}`,
      transactionId
    });
    // Use M-Pesa's CheckoutRequestID as the transaction identifier
    if (result.CheckoutRequestID) {
      transactionId = result.CheckoutRequestID;
    }
  } else if (provider.toUpperCase() === 'ECOCASH') {
    result = await ecocashService.initiatePayment({
      phoneNumber,
      amount,
      reference: reference || 'MOT-TRIP',
      description: `Payment for User ${userId}`,
      transactionId
    });
  } else {
    throw new ApiError(400, 'Invalid payment provider. Use MPESA or ECOCASH.', 'INVALID_PROVIDER');
  }

  // Record the payment in the database as PENDING
  const payment = await Payment.create({
    ride_id: ride_id || null,
    amount,
    provider: provider.toUpperCase(),
    status: 'PENDING',
    transaction_id: transactionId,
    user_id: userId,
    metadata: { phoneNumber, reference, result }
  });

  logger.info(`Mobile payment initiated: ${payment.id}`, { transactionId, provider, amount, userId });

  return res.status(200).json(new ApiResponse(200, { 
    paymentId: payment.id,
    transactionId, 
    provider,
    ...result 
  }, 'Payment initiation successful'));
});

// Specific M-Pesa initiation
exports.initiateMpesaPayment = asyncHandler(async (req, res, next) => {
  req.body.provider = 'MPESA';
  return exports.initiateMobilePayment(req, res, next);
});

// Specific EcoCash initiation
exports.initiateEcoCashPayment = asyncHandler(async (req, res, next) => {
  req.body.provider = 'ECOCASH';
  return exports.initiateMobilePayment(req, res, next);
});

// Query payment status
exports.queryPaymentStatus = asyncHandler(async (req, res, next) => {
  const { provider, transactionId } = req.params; // from /status/:provider/:id
  const { providerTransactionId } = req.query; // optional

  req.query.provider = provider || req.query.provider;
  req.query.transactionId = transactionId || req.query.transactionId;
  
  return exports.checkStatus(req, res, next);
});

// Process M-Pesa Payout (B2C)
exports.processMpesaPayout = asyncHandler(async (req, res, next) => {
  const { phoneNumber, amount, remarks, occasion } = req.body;
  const transactionId = `PAY-${Date.now()}`;

  const result = await mpesaService.b2cPayment({
    phoneNumber,
    amount,
    remarks,
    occasion,
    transactionId
  });

  return res.status(200).json(new ApiResponse(200, result, 'Payout initiated successfully'));
});

// Reverse Transaction
exports.reverseTransaction = asyncHandler(async (req, res, next) => {
  const { transactionId, amount, reason } = req.body;

  const result = await mpesaService.reverseTransaction({
    transactionId,
    amount,
    remarks: reason,
    receiverParty: process.env.MPESA_SHORTCODE 
  });

  return res.status(200).json(new ApiResponse(200, result, 'Reversal request submitted'));
});

// Get transaction history
exports.getTransactionHistory = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await Payment.findAndCountAll({
    where: { user_id: req.user.id },
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset
  });

  return res.status(200).json(new ApiResponse(200, {
    transactions: rows,
    total: count
  }, 'Transaction history retrieved'));
});

// M-Pesa webhook handler
exports.mpesaWebhook = asyncHandler(async (req, res, next) => {
  logger.info('M-Pesa webhook received', { body: req.body });
  await mpesaService.handleWebhook(req.body);
  // M-Pesa requires specific acknowledgment
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// EcoCash webhook handler
exports.ecocashWebhook = asyncHandler(async (req, res, next) => {
  logger.info('EcoCash webhook received', { body: req.body });
  await ecocashService.handleWebhook(req.body);
  return res.status(200).json({ status: 'OK', message: 'Webhook processed' });
});

// Check payment status
exports.checkStatus = asyncHandler(async (req, res, next) => {
  const { provider, transactionId, providerTransactionId } = req.query;

  if (!provider || !transactionId) {
    throw new ApiError(400, 'Provider and transactionId are required', 'MISSING_PARAMS');
  }

  let status;
  if (provider.toUpperCase() === 'MPESA') {
    status = await mpesaService.queryStkStatus(providerTransactionId || transactionId);
  } else if (provider.toUpperCase() === 'ECOCASH') {
    status = await ecocashService.queryPayment(providerTransactionId, transactionId);
  } else {
    throw new ApiError(400, 'Invalid payment provider', 'INVALID_PROVIDER');
  }

  return res.status(200).json(new ApiResponse(200, status, 'Transaction status retrieved'));
});

// Delete payment (admin only)
exports.deletePayment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const payment = await Payment.findByPk(id);
  
  if (!payment) {
    throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  }
  
  await payment.destroy();
  
  logger.info(`Payment deleted: ${id}`, { paymentId: id, userId: req.user.id });
  
  return res.status(200).json(new ApiResponse(200, null, 'Payment deleted successfully'));
});