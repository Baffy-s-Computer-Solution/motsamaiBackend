const service = require('./service');
const { ok } = require('../shared/response');

const listTickets = async (req, res, next) => {
  try {
    const data = await service.listTickets(req.query);
    return ok(res, data, 'Support tickets loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { listTickets };
