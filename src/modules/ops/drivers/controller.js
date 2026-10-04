const service = require('./service');
const { ok } = require('../shared/response');

const listDrivers = async (req, res, next) => {
  try {
    const data = await service.listDrivers(req.query);
    return ok(res, data, 'Drivers loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { listDrivers };
