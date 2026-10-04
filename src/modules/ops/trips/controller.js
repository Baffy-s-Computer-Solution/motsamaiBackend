const service = require('./service');
const { ok } = require('../shared/response');

const listTrips = async (req, res, next) => {
  try {
    const data = await service.listTrips(req.query);
    return ok(res, data, 'Trips loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { listTrips };
