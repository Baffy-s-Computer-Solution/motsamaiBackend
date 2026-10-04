const Joi = require('joi');

const idParam = {
  params: Joi.object({
    id: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()).required(),
  }),
};

const listNotifications = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('pending', 'sent', 'failed', 'read'),
  }),
};

const sendNotification = {
  body: Joi.object({
    userId: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()).required(),
    channel: Joi.string().valid('email', 'sms', 'push', 'in_app').default('in_app'),
    title: Joi.string().trim().max(160).required(),
    body: Joi.string().trim().required(),
    message: Joi.string().trim(),
    metadata: Joi.object().unknown(true),
  }),
};

module.exports = {
  listNotifications,
  getNotificationById: idParam,
  sendNotification,
  sendTemplateNotification: sendNotification,
  markAsRead: idParam,
  markAllAsRead: {},
  dismissNotification: idParam,
  updatePreferences: { body: Joi.object().unknown(true).required() },
  registerPushToken: { body: Joi.object({ token: Joi.string(), deviceToken: Joi.string() }).or('token', 'deviceToken') },
  unregisterPushToken: {},
  getStatistics: {},
  getAnalytics: {},
};
