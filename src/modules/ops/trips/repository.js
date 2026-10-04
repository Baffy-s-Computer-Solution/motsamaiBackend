const { Op } = require('sequelize');
const { Ride, User, Driver } = require('../../../models');

const listTrips = async ({ status, from, to, limit, offset }) => {
  const where = {};
  if (status) where.status = status;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = from;
    if (to) where.created_at[Op.lte] = to;
  }

  return Ride.findAndCountAll({
    where,
    include: [
      { model: User, as: 'rider', attributes: ['id', 'name', 'email'] },
      { model: Driver, as: 'driver', attributes: ['id', 'user_id', 'status'] },
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
};

module.exports = { listTrips };
