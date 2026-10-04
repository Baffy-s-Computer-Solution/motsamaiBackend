const service = require('./service');
const { ok } = require('../shared/response');

const listPayments = async (req, res, next) => {
  try {
    const data = await service.listPayments(req.query);
    return ok(res, data, 'Payments loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { listPayments };
