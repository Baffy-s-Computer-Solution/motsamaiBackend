const { Payment } = require('../models');

const createPayment = async (payload) => Payment.create(payload);
const listPayments = async () => Payment.findAll({ order: [['created_at', 'DESC']] });

module.exports = { createPayment, listPayments };
