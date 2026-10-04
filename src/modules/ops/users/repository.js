const { Op } = require('sequelize');
const { User } = require('../../../models');

const listUsers = async ({ search, limit, offset }) => {
  const where = search
    ? {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ],
      }
    : {};

  return User.findAndCountAll({
    where,
    attributes: { exclude: ['password_hash'] },
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
};

module.exports = { listUsers };
