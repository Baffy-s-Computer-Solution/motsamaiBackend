const mpesaService = require('../services/mpesa.service');
const ecocashService = require('../services/ecocash.service');
const asyncHandler = require('../utils/asyncHandler');
const { ApiResponse } = require('../utils/apiResponse');
const { ApiError } = require('../utils/apiError');
const { Payment, Ride, User, Wallet, Transaction, sequelize } = require('../models');
const { Op, Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const vodacomService = require('../services/vodacomLesotho.service');
const vodacomWebhook = require('../webhooks/vodacomWebhook');

/**
 * Production Payment Controller handling Lesotho Mobile Money
 */

// List all payments (with optional filters)
exports.list = asyncHandler(async (req, res, next) => {
  const {
    status,
    provider,
    method,
    ride_id,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10,
  } = req.query;
  const pageNumber = parseInt(page, 10) || 1;
  const pageSize = parseInt(limit, 10) || 10;
  const offset = (pageNumber - 1) * pageSize;
  
  const where = {};
  if (status) where.status = status;
  if (provider || method) where.provider = provider || method;
  if (ride_id) where.ride_id = ride_id;
  if (search) {
    where[Op.or] = [
      { id: { [Op.iLike]: `%${search}%` } },
      { provider_ref: { [Op.iLike]: `%${search}%` } },
    ];
  }
  
  // If user is not admin, only show their own payments
  if (req.user.role !== 'admin') {
    const rides = await Ride.findAll({ 
      where: { rider_id: req.user.id },
      attributes: ['id']
    });
    const rideIds = rides.map(r => r.id);
    where.ride_id = { [Op.in]: rideIds };
  }
  
  const sortableColumns = ['createdAt', 'updatedAt', 'amount', 'status', 'provider'];
  const orderColumn = sortableColumns.includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let result;
  const query = {
    where,
    order: [[orderColumn, orderDirection]],
    limit: pageSize,
    offset,
  };

  try {
    result = await Payment.findAndCountAll({
      ...query,
      include: [
        { model: Ride, as: 'ride', attributes: ['id', 'pickup_address', 'dropoff_address', 'status'], required: false }
      ],
    });
  } catch (error) {
    logger.warn('Payment list include failed; retrying without ride include', { message: error.message });
    try {
      result = await Payment.findAndCountAll(query);
    } catch (fallbackError) {
      logger.warn('Payment list unavailable; returning empty list', { message: fallbackError.message });
      result = { count: 0, rows: [] };
    }
  }

  const { count, rows } = result;
  
  return res.status(200).json(new ApiResponse(200, {
    payments: rows,
    total: count,
    pagination: {
      total: count,
      page: pageNumber,
      limit: pageSize,
      pages: Math.ceil(count / pageSize)
    }
  }, 'Payments retrieved successfully'));
});

// Create a new payment (direct record)
exports.create = asyncHandler(async (req, res, next) => {
  const { ride_id, rideId, amount, provider, transaction_id, status = 'pending', payment_method, method, currency = 'USD' } = req.body;
  const rideIdValue = ride_id || rideId;
  
  // Verify the ride belongs to the user (if not admin)
  if (req.user.role !== 'admin') {
    const ride = await Ride.findOne({
      where: { id: rideIdValue, rider_id: req.user.id }
    });
    if (!ride) {
      throw new ApiError(404, 'Ride not found or unauthorized', 'RIDE_NOT_FOUND');
    }
  }
  
  const payment = await Payment.create({
    ride_id: rideIdValue,
    amount,
    provider: provider || payment_method || method || 'wallet',
    provider_ref: transaction_id || `TXN-${Date.now()}`,
    status: normalizePaymentStatus(status),
    currency,
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
  
  const normalizedStatus = normalizePaymentStatus(status);
  if (!normalizedStatus) {
    throw new ApiError(400, 'Invalid status value', 'INVALID_STATUS');
  }
  
  const payment = await Payment.findByPk(id);
  
  if (!payment) {
    throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  }
  
  await payment.update({ status: normalizedStatus, provider_ref: req.body.providerRef || payment.provider_ref });
  
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
    status: 'pending',
    provider_ref: transactionId,
    user_id: userId,
  });

  logger.info(`Mobile payment initiated: ${payment.id}`, { transactionId, provider, amount, userId });

  return res.status(200).json(new ApiResponse(200, { 
    paymentId: payment.id,
    transactionId, 
    provider,
    ...result 
  }, 'Payment initiation successful'));
});

/**
 * Process payment reversals/refunds
 */
exports.processRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const payment = await Payment.findByPk(id);
  if (!payment || !['succeeded', 'completed'].includes(payment.status)) {
    throw new ApiError(400, 'Only completed payments can be refunded');
  }

  // Logic for gateway refund would go here (M-Pesa/EcoCash reversal)
  await payment.update({ status: 'refunded' });
  
  return res.status(200).json(new ApiResponse(200, payment, 'Refund processed successfully'));
});

/**
 * Generate basic receipt data
 */
exports.generateReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);
  if (!payment) throw new ApiError(404, 'Payment not found');

  return res.status(200).json(new ApiResponse(200, {
    receiptNumber: `REC-${payment.provider_ref || payment.id}`,
    date: payment.createdAt,
    amount: payment.amount,
    provider: payment.provider
  }));
});

/**
 * Aggregate payment statistics
 */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  const summary = await Payment.findAll({
    attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'], [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
    group: ['status']
  });
  return res.status(200).json(new ApiResponse(200, summary));
});

exports.getPaymentStatistics = exports.getPaymentSummary;

exports.getWalletBalance = asyncHandler(async (req, res) => {
  const [wallet] = await Wallet.findOrCreate({
    where: { user_id: req.user.id },
    defaults: { user_id: req.user.id, balance: 0, currency: 'USD', status: 'active' },
  });

  return res.status(200).json(new ApiResponse(200, wallet, 'Wallet retrieved successfully'));
});

exports.topUpWallet = asyncHandler(async (req, res) => {
  const { amount, currency = 'USD', method } = req.body;
  const result = await sequelize.transaction(async (transaction) => {
    const [wallet] = await Wallet.findOrCreate({
      where: { user_id: req.user.id },
      defaults: { user_id: req.user.id, balance: 0, currency, status: 'active' },
      transaction,
    });

    const nextBalance = Number(wallet.balance) + Number(amount);
    await wallet.update({ balance: nextBalance, currency }, { transaction });
    const txn = await Transaction.create({
      wallet_id: wallet.id,
      user_id: req.user.id,
      type: 'credit',
      amount,
      currency,
      status: 'completed',
      reference: method || 'wallet_topup',
    }, { transaction });

    return { wallet, transaction: txn };
  });

  return res.status(201).json(new ApiResponse(201, result, 'Wallet topped up successfully'));
});

exports.withdrawWallet = asyncHandler(async (req, res) => {
  const { amount, currency = 'USD', destination } = req.body;
  const result = await sequelize.transaction(async (transaction) => {
    const wallet = await Wallet.findOne({ where: { user_id: req.user.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!wallet) throw new ApiError(404, 'Wallet not found', 'WALLET_NOT_FOUND');
    if (Number(wallet.balance) < Number(amount)) throw new ApiError(400, 'Insufficient wallet balance', 'INSUFFICIENT_FUNDS');

    const nextBalance = Number(wallet.balance) - Number(amount);
    await wallet.update({ balance: nextBalance }, { transaction });
    const txn = await Transaction.create({
      wallet_id: wallet.id,
      user_id: req.user.id,
      type: 'debit',
      amount,
      currency,
      status: 'pending',
      reference: destination || 'wallet_withdrawal',
    }, { transaction });

    return { wallet, transaction: txn };
  });

  return res.status(201).json(new ApiResponse(201, result, 'Withdrawal requested successfully'));
});

exports.getPaymentMethods = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { attributes: ['id', 'metadata'] });
  const methods = user && user.metadata && user.metadata.paymentMethods ? user.metadata.paymentMethods : [];
  return res.status(200).json(new ApiResponse(200, methods, 'Payment methods retrieved'));
});

exports.addPaymentMethod = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  const method = { id: `pm_${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
  const metadata = { ...(user.metadata || {}) };
  metadata.paymentMethods = [...(metadata.paymentMethods || []), method];
  await user.update({ metadata });
  return res.status(201).json(new ApiResponse(201, method, 'Payment method added'));
});

exports.removePaymentMethod = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  const metadata = { ...(user.metadata || {}) };
  metadata.paymentMethods = (metadata.paymentMethods || []).filter((method) => String(method.id) !== String(req.params.id));
  await user.update({ metadata });
  return res.status(200).json(new ApiResponse(200, metadata.paymentMethods, 'Payment method removed'));
});

exports.updatePaymentMethod = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const metadata = { ...(user.metadata || {}) };
  metadata.paymentMethods = (metadata.paymentMethods || []).map((method) => (
    String(method.id) === String(req.params.id) ? { ...method, ...req.body, updatedAt: new Date().toISOString() } : method
  ));

  await user.update({ metadata });
  const method = metadata.paymentMethods.find((item) => String(item.id) === String(req.params.id));
  return res.status(200).json(new ApiResponse(200, method, 'Payment method updated'));
});

exports.setDefaultPaymentMethod = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

  const metadata = { ...(user.metadata || {}) };
  metadata.paymentMethods = (metadata.paymentMethods || []).map((method) => ({
    ...method,
    default: String(method.id) === String(req.params.id),
    isDefault: String(method.id) === String(req.params.id),
  }));

  await user.update({ metadata });
  return res.status(200).json(new ApiResponse(200, metadata.paymentMethods, 'Default payment method updated'));
});

exports.getInvoices = exports.list;
exports.getInvoiceById = exports.generateReceipt;
exports.downloadInvoice = exports.generateReceipt;
exports.stripeWebhook = asyncHandler(async (req, res) => {
  logger.info('Stripe webhook received', { type: req.body && req.body.type });
  return res.status(200).json(new ApiResponse(200, { received: true }, 'Webhook received'));
});

exports.initiateVodacomPayment = asyncHandler(async (req, res) => {
  const { phoneNumber, amount, reference, description, rideId, ride_id } = req.body;
  if (!phoneNumber || amount === undefined) throw new ApiError(400, 'Phone number and amount are required', 'MISSING_FIELDS');
  const result = await vodacomService.initiatePayment({ phoneNumber, amount, reference, description, rideId: rideId || ride_id });
  const payment = await Payment.create({
    ride_id: rideId || ride_id,
    user_id: req.user.id,
    amount: result.amount,
    provider: 'MPESA',
    provider_ref: result.transactionId,
    currency: 'LSL',
    status: 'pending',
    metadata: { phoneNumber: result.phoneNumber, reference: result.reference, vodacom: result.rawResponse },
  });
  return res.status(201).json(new ApiResponse(201, { ...result, paymentId: payment.id }, 'Vodacom Lesotho payment initiated'));
});

exports.queryVodacomStatus = asyncHandler(async (req, res) => {
  const result = await vodacomService.queryTransaction(req.params.transactionId);
  await Payment.update({ status: result.success ? 'succeeded' : result.status === 'pending' ? 'pending' : 'failed' }, { where: { provider_ref: req.params.transactionId } });
  return res.status(200).json(new ApiResponse(200, result, 'Vodacom payment status retrieved'));
});

exports.refundVodacomPayment = asyncHandler(async (req, res) => {
  const result = await vodacomService.reverseTransaction(req.params.transactionId, req.body.amount, req.body.reason);
  if (result.success) await Payment.update({ status: 'refunded' }, { where: { provider_ref: req.params.transactionId } });
  return res.status(200).json(new ApiResponse(200, result, 'Vodacom refund requested'));
});

exports.handleVodacomCallback = (req, res) => vodacomWebhook.handleCallback(req, res);
exports.vodacomHealth = asyncHandler(async (req, res) => res.status(200).json(new ApiResponse(200, await vodacomService.healthCheck(), 'Vodacom health check completed')));

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

const normalizePaymentStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return 'succeeded';
  if (['pending', 'succeeded', 'failed', 'refunded'].includes(value)) return value;
  return null;
};
