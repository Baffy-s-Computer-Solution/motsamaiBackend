const asyncHandler = require('../utils/asyncHandler');
const { sendResponse, sendPagedResponse } = require('../utils/response.util');
const { Notification, User } = require('../models');
const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

exports.list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  const where = req.user && req.user.role === 'admin' ? {} : { user_id: req.user.id };
  if (req.query.status) where.status = req.query.status;

  let count = 0;
  let rows = [];
  try {
    const result = await Notification.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });
    count = result.count;
    rows = result.rows;
  } catch (error) {
    logger.warn('Notification list unavailable; returning empty list', { error: error.message });
  }
  return sendPagedResponse(res, 200, rows, count, page, limit);
});

exports.getNotificationById = asyncHandler(async (req, res) => {
  const notification = await Notification.findByPk(req.params.id);
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  return sendResponse(res, 200, notification);
});

exports.send = asyncHandler(async (req, res) => {
  const notification = await Notification.create({
    user_id: req.body.userId || req.body.user_id,
    channel: req.body.channel || 'in_app',
    title: req.body.title,
    body: req.body.body || req.body.message,
    status: 'pending',
    metadata: req.body.metadata || {},
  });
  return sendResponse(res, 201, notification, 'Notification queued');
});

exports.sendTemplate = asyncHandler(async (req, res) => {
  return res.status(501).json({ success: false, message: 'Template notifications require a templates schema before this endpoint can be enabled' });
});

exports.getTemplates = asyncHandler(async (req, res) => {
  return res.status(501).json({ success: false, message: 'Notification templates require a templates schema before this endpoint can be enabled' });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  let unreadCount = 0;
  try {
    unreadCount = await Notification.count({ where: { user_id: req.user.id, status: { [Sequelize.Op.ne]: 'read' } } });
  } catch (error) {
    logger.warn('Notification unread count unavailable; returning zero', { error: error.message });
  }
  return sendResponse(res, 200, { unreadCount });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  await notification.update({ status: 'read', read_at: new Date() });
  return sendResponse(res, 200, notification, 'Notification marked as read');
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.update({ status: 'read', read_at: new Date() }, { where: { user_id: req.user.id } });
  return sendResponse(res, 200, null, 'All notifications marked as read');
});

exports.dismiss = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ where: { id: req.params.id, user_id: req.user.id } });
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  await notification.destroy();
  return sendResponse(res, 200, null, 'Notification dismissed');
});

exports.deleteNotification = exports.dismiss;

exports.deleteAll = asyncHandler(async (req, res) => {
  await Notification.destroy({ where: { user_id: req.user.id } });
  return sendResponse(res, 200, null, 'Notifications deleted');
});

exports.getPreferences = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  return sendResponse(res, 200, (user.metadata || {}).notificationPreferences || { email: true, push: true, sms: false });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  await user.update({ metadata: { ...(user.metadata || {}), notificationPreferences: req.body } });
  return sendResponse(res, 200, req.body, 'Preferences updated');
});

exports.registerPushToken = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  await user.update({ device_token: req.body.token || req.body.deviceToken });
  return sendResponse(res, 200, null, 'Push token registered');
});

exports.unregisterPushToken = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  await user.update({ device_token: null });
  return sendResponse(res, 200, null, 'Push token unregistered');
});

exports.getStatistics = asyncHandler(async (req, res) => {
  const rows = await Notification.findAll({
    attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
    group: ['status'],
    raw: true,
  });
  return sendResponse(res, 200, rows, 'Notification statistics retrieved');
});

exports.getAnalytics = exports.getStatistics;
