const service = require('./service');
const { ok } = require('../shared/response');

const listUsers = async (req, res, next) => {
  try {
    const data = await service.listUsers(req.query);
    return ok(res, data, 'Users loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { listUsers };
