const asyncHandler = require('../utils/asyncHandler');
const { sendResponse, sendPagedResponse } = require('../utils/response.util');
const { Incident } = require('../models');
const { Op, Sequelize } = require('sequelize');

exports.list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.severity) where.severity = req.query.severity;

  const { count, rows } = await Incident.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
  });

  return sendPagedResponse(res, 200, rows, count, page, limit);
});

exports.create = asyncHandler(async (req, res) => {
  const incident = await Incident.create({
    ride_id: req.body.rideId || req.body.ride_id || null,
    user_id: req.user && req.user.id ? req.user.id : req.body.user_id,
    type: req.body.type,
    description: req.body.description,
    severity: req.body.severity || 'medium',
    status: 'open',
    metadata: req.body.metadata || {},
  });

  return sendResponse(res, 201, incident, 'Incident reported');
});

exports.getIncidentById = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  return sendResponse(res, 200, incident);
});

exports.update = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  await incident.update(req.body);
  return sendResponse(res, 200, incident, 'Incident updated');
});

exports.delete = asyncHandler(async (req, res) => {
  const deleted = await Incident.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ success: false, message: 'Incident not found' });
  return sendResponse(res, 200, null, 'Incident deleted');
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  await incident.update({
    status: req.body.status,
    metadata: { ...(incident.metadata || {}), resolution: req.body.resolution || null },
  });
  return sendResponse(res, 200, incident, 'Incident status updated');
});

exports.assign = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  await incident.update({
    metadata: { ...(incident.metadata || {}), assignedTo: req.body.assignedTo || req.body.userId },
  });
  return sendResponse(res, 200, incident, 'Incident assigned');
});

exports.escalate = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  await incident.update({
    severity: 'high',
    metadata: { ...(incident.metadata || {}), escalationReason: req.body.reason || null },
  });
  return sendResponse(res, 200, incident, 'Incident escalated');
});

exports.uploadPhotos = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  const photos = req.body.photos || req.files || [];
  await incident.update({ metadata: { ...(incident.metadata || {}), photos } });
  return sendResponse(res, 200, incident, 'Incident photos attached');
});

exports.addComment = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  const comments = [...((incident.metadata || {}).comments || []), {
    user_id: req.user && req.user.id,
    text: req.body.text,
    visibility: req.body.visibility || 'internal',
    created_at: new Date().toISOString(),
  }];
  await incident.update({ metadata: { ...(incident.metadata || {}), comments } });
  return sendResponse(res, 201, comments[comments.length - 1], 'Comment added');
});

exports.getComments = asyncHandler(async (req, res) => {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
  return sendResponse(res, 200, (incident.metadata || {}).comments || []);
});

exports.getStatistics = asyncHandler(async (req, res) => {
  const rows = await Incident.findAll({
    attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
    group: ['status'],
    raw: true,
  });
  return sendResponse(res, 200, rows, 'Incident statistics retrieved');
});

exports.getTrends = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const count = await Incident.count({ where: { created_at: { [Op.gte]: since } } });
  return sendResponse(res, 200, { periodDays: 30, count }, 'Incident trends retrieved');
});

exports.generateReport = asyncHandler(async (req, res) => {
  const incidents = await Incident.findAll({ order: [['created_at', 'DESC']], limit: 1000 });
  return sendResponse(res, 200, incidents, 'Incident report generated');
});
