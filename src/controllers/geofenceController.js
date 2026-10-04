const asyncHandler = require('../utils/asyncHandler');
const { sendResponse, sendPagedResponse } = require('../utils/response.util');
const { ApiResponse } = require('../utils/apiResponse');
const { Zone } = require('../models');
const { Op } = require('sequelize');

exports.list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  const where = {};

  if (req.query.status) where.is_active = req.query.status === 'active';
  if (req.query.search) where.name = { [Op.iLike]: `%${req.query.search}%` };

  const { count, rows } = await Zone.findAndCountAll({
    where,
    limit,
    offset,
    order: [['name', 'ASC']],
  });

  return sendPagedResponse(res, 200, rows, count, page, limit);
});

exports.create = asyncHandler(async (req, res) => {
  const zone = await Zone.create({
    name: req.body.name,
    city: req.body.city || req.body.name,
    base_fare: req.body.base_fare || req.body.baseFare || 1.5,
    per_km_rate: req.body.per_km_rate || req.body.perKmRate || 1,
    is_active: req.body.is_active !== undefined ? req.body.is_active : true,
  });

  return sendResponse(res, 201, zone, 'Geofence created');
});

exports.update = asyncHandler(async (req, res) => {
  const zone = await Zone.findByPk(req.params.id);
  if (!zone) return res.status(404).json(new ApiResponse(404, null, 'Geofence not found'));

  await zone.update(req.body);
  return sendResponse(res, 200, zone, 'Geofence updated');
});

exports.delete = asyncHandler(async (req, res) => {
  const deleted = await Zone.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json(new ApiResponse(404, null, 'Geofence not found'));

  return sendResponse(res, 200, null, 'Geofence deleted');
});

exports.getNearby = asyncHandler(async (req, res) => spatialUnavailable(res));
exports.checkGeofence = asyncHandler(async (req, res) => spatialUnavailable(res));
exports.getEvents = asyncHandler(async (req, res) => spatialUnavailable(res));

const spatialUnavailable = (res) => res.status(501).json(
  new ApiResponse(501, null, 'Spatial geofencing requires boundary columns/PostGIS migration before this endpoint can be enabled')
);
