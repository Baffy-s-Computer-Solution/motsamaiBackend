const { Op } = require('sequelize');
const { Driver, User } = require('../../../models');

const listDrivers = async ({ search, limit, offset }) => {
  const where = search ? { license_number: { [Op.like]: `%${search}%` } } : {};
  return Driver.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'status'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
};

module.exports = { listDrivers };
