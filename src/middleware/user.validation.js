const Joi = require('joi');

const updateProfile = {
  body: Joi.object().keys({
    name: Joi.string(),
    phone: Joi.string(),
    preferredLanguage: Joi.string().valid('en', 'st'),
    preferences: Joi.object(),
    settings: Joi.object(),
  }).min(1),
};

const changePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().min(8),
  }),
};

const getRideHistory = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    status: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

const registerDevice = {
  body: Joi.object().keys({
    deviceId: Joi.string().required(),
    deviceName: Joi.string().required(),
    deviceType: Joi.string().valid('ios', 'android', 'web'),
    pushToken: Joi.string(),
  }),
};

const savePlace = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
    address: Joi.string(),
    type: Joi.string().valid('home', 'work', 'other'),
  }),
};

module.exports = {
  updateProfile,
  changePassword,
  getRideHistory,
  registerDevice,
  savePlace,
};