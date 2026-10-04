const { Op } = require('sequelize');
const { Payment, User, Ride } = require('../../../models');

const listPayments = async ({ status, from, to, limit, offset }) => {
  const where = {};
  if (status) where.status = status;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = from;
    if (to) where.created_at[Op.lte] = to;
  }

  return Payment.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: Ride, as: 'ride', attributes: ['id', 'status', 'distance_km'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
};

module.exports = { listPayments };
