const { Op } = require('sequelize');
const { SupportTicket, User } = require('../../../models');

const listTickets = async ({ status, priority, search, limit, offset }) => {
  const where = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (search) where.subject = { [Op.like]: `%${search}%` };

  return SupportTicket.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });
};

module.exports = { listTickets };
