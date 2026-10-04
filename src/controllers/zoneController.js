const zoneService = require('../services/zoneService');
const { Zone } = require('../models');
const { ok } = require('../utils/apiResponse');
const logger = require('../utils/logger');

exports.create = async (req, res, next) => {
  try {
    return ok(res, await zoneService.createZone(req.body), 'Zone created.', 201);
  } catch (e) {
    return next(e);
  }
};

exports.list = async (req, res, next) => {
  try {
    return ok(res, await zoneService.listZones(), 'Zones fetched.');
  } catch (e) {
    logger.warn('Zones list unavailable; returning empty list', { error: e.message });
    return ok(res, [], 'Zones fetched.');
  }
};

exports.update = async (req, res, next) => {
  try {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    await zone.update(req.body);
    return ok(res, zone, 'Zone updated.');
  } catch (e) {
    return next(e);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const zone = await Zone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
    await zone.destroy();
    return ok(res, { id: req.params.id }, 'Zone deleted.');
  } catch (e) {
    return next(e);
  }
};
