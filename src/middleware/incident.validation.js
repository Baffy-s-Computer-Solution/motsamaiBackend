const Joi = require('joi');

/**
 * Incident Validation Schemas
 */
const incidentValidation = {
  createIncident: {
    body: Joi.object().keys({
      type: Joi.string().valid('accident', 'dispute', 'theft', 'other').required(),
      severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
      description: Joi.string().required(),
      rideId: Joi.string(),
      location: Joi.object().keys({
        latitude: Joi.number().required(),
        longitude: Joi.number().required(),
        address: Joi.string()
      }),
      participants: Joi.array().items(Joi.string()),
      metadata: Joi.object()
    })
  },

  listIncidents: {
    query: Joi.object().keys({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().valid('reported', 'investigating', 'resolved', 'closed'),
      type: Joi.string().valid('accident', 'dispute', 'theft', 'other'),
      severity: Joi.string().valid('low', 'medium', 'high', 'critical'),
      startDate: Joi.date(),
      endDate: Joi.date()
    })
  },

  updateIncidentStatus: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      status: Joi.string().valid('investigating', 'resolved', 'closed').required(),
      notes: Joi.string()
    })
  },

  addComment: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      text: Joi.string().required(),
      visibility: Joi.string().valid('public', 'private', 'internal').default('internal')
    })
  },

  uploadIncidentPhotos: {
    params: Joi.object().keys({
      id: Joi.string().required()
    })
  }
};

module.exports = {
  ...incidentValidation,
  incidentValidation
};