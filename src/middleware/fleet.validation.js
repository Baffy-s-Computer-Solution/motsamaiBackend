const Joi = require('joi');

/**
 * Fleet Validation Schemas
 */
const fleetValidation = {
  listFleets: {
    query: Joi.object().keys({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().valid('active', 'inactive', 'archived'),
      ownerId: Joi.string(),
      search: Joi.string()
    })
  },

  createFleet: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      description: Joi.string(),
      ownerId: Joi.string(),
      settings: Joi.object(),
      metadata: Joi.object()
    })
  },

  addVehicleToFleet: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      vehicleId: Joi.string().required(),
      assignmentDate: Joi.date(),
      details: Joi.object()
    })
  },

  addDriverToFleet: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      driverId: Joi.string().required(),
      role: Joi.string().valid('driver', 'manager', 'supervisor').default('driver'),
      details: Joi.object()
    })
  },

  scheduleMaintenance: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      vehicleId: Joi.string().required(),
      type: Joi.string().valid('routine', 'repair', 'inspection').required(),
      scheduledDate: Joi.date().required(),
      description: Joi.string(),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
    })
  },

  updateMaintenance: {
    params: Joi.object().keys({
      id: Joi.string().required(),
      maintenanceId: Joi.string().required()
    }),
    body: Joi.object().keys({
      status: Joi.string().valid('scheduled', 'in-progress', 'completed', 'cancelled'),
      completedDate: Joi.date(),
      notes: Joi.string()
    }).min(1)
  },

  getFleetFinancials: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    query: Joi.object().keys({
      period: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').default('month'),
      startDate: Joi.date(),
      endDate: Joi.date()
    })
  },

  updateFleetSettings: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().required()
  }
};

module.exports = { fleetValidation };