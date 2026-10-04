const service = require('./service');
const { ok } = require('../shared/response');

const getDashboard = async (req, res, next) => {
  try {
    const data = await service.getAdminDashboard();
    return ok(res, data, 'Operations dashboard loaded');
  } catch (error) {
    return next(error);
  }
};

module.exports = { getDashboard };
