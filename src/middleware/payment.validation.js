const Joi = require('joi');

const idParam = {
  params: Joi.object({
    id: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()).required(),
  }),
};

const money = Joi.number().precision(2).positive();
const currency = Joi.string().trim().uppercase().length(3).default('USD');

const getPaymentHistory = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('pending', 'succeeded', 'completed', 'failed', 'refunded', 'cancelled'),
    type: Joi.string().trim().max(40),
    method: Joi.string().trim().max(40),
    search: Joi.string().trim().allow('').max(120),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'amount', 'status', 'provider').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
};

const createPayment = {
  body: Joi.object({
    rideId: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()).required(),
    amount: money.required(),
    currency,
    method: Joi.string().valid('card', 'wallet', 'cash', 'stripe', 'mpesa', 'ecocash').required(),
    description: Joi.string().trim().max(500),
    metadata: Joi.object().unknown(true),
  }),
};

const updatePaymentStatus = {
  ...idParam,
  body: Joi.object({
    status: Joi.string().valid('pending', 'succeeded', 'completed', 'failed', 'refunded', 'cancelled').required(),
    providerRef: Joi.string().trim().max(190),
    reason: Joi.string().trim().max(500),
  }),
};

const processRefund = {
  ...idParam,
  body: Joi.object({
    amount: money,
    reason: Joi.string().trim().max(500).required(),
  }),
};

const addPaymentMethod = {
  body: Joi.object({
    type: Joi.string().valid('card', 'wallet', 'mpesa', 'ecocash').required(),
    token: Joi.string().trim().min(1),
    provider: Joi.string().trim().max(40),
    metadata: Joi.object().unknown(true),
  }),
};

const initiateMobilePayment = {
  body: Joi.object({
    phone: Joi.string().trim().min(7).max(20).required(),
    amount: money.required(),
    currency,
    rideId: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()),
    provider: Joi.string().valid('mpesa', 'ecocash'),
  }),
};

const queryPaymentStatus = idParam;
const queryPaymentStatusQuery = {
  query: Joi.object({
    transactionId: Joi.string().trim().min(1).required(),
    provider: Joi.string().valid('mpesa', 'ecocash', 'stripe'),
  }),
};

const walletAmount = {
  body: Joi.object({
    amount: money.required(),
    currency,
    method: Joi.string().trim().max(40),
    destination: Joi.string().trim().max(190),
  }),
};

const getPaymentStatistics = {
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    groupBy: Joi.string().valid('day', 'week', 'month', 'status', 'provider'),
  }),
};

module.exports = {
  getPaymentHistory,
  getPaymentById: idParam,
  createPayment,
  updatePaymentStatus,
  deletePayment: idParam,
  processRefund,
  initiateMobilePayment,
  initiateMpesaPayment: initiateMobilePayment,
  initiateEcoCashPayment: initiateMobilePayment,
  queryPaymentStatus,
  queryPaymentStatusQuery,
  topUpWallet: walletAmount,
  withdrawWallet: walletAmount,
  processPayout: walletAmount,
  addPaymentMethod,
  removePaymentMethod: idParam,
  getTransactionHistory: getPaymentHistory,
  getInvoices: getPaymentHistory,
  getInvoiceById: idParam,
  getPaymentStatistics,
  reverseTransaction: processRefund,
};
