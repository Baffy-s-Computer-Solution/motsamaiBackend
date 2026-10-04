const Joi = require('joi');

const idParam = {
  params: Joi.object({
    id: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()).required(),
  }),
};

const listGeofences = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('active', 'inactive'),
    type: Joi.string().trim().max(80),
    search: Joi.string().trim().max(120),
  }),
};

const createGeofence = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    city: Joi.string().trim().max(120),
    type: Joi.string().trim().max(80),
    boundary: Joi.object().unknown(true),
    settings: Joi.object().unknown(true),
    base_fare: Joi.number().min(0),
    baseFare: Joi.number().min(0),
    per_km_rate: Joi.number().min(0),
    perKmRate: Joi.number().min(0),
    is_active: Joi.boolean(),
  }),
};

const updateGeofence = {
  ...idParam,
  body: createGeofence.body.fork(['name'], (schema) => schema.optional()).min(1),
};

const locationQuery = {
  query: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    radius: Joi.number().positive().max(500),
    geofenceId: Joi.alternatives().try(Joi.string().trim().min(1), Joi.number().integer().positive()),
  }),
};

module.exports = {
  listGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence: idParam,
  getNearbyGeofences: locationQuery,
  checkGeofence: locationQuery,
  getGeofenceEvents: listGeofences,
};
