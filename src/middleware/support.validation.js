const Joi = require('joi');

/**
 * Support Validation Schemas
 */
const supportValidation = {
  createTicket: {
    body: Joi.object().keys({
      subject: Joi.string().required(),
      description: Joi.string().required(),
      category: Joi.string().valid('ride', 'payment', 'technical', 'other').required(),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent').required(),
      rideId: Joi.string(),
      paymentId: Joi.string(),
      attachments: Joi.array().items(Joi.string()),
      metadata: Joi.object()
    })
  },

  listTickets: {
    query: Joi.object().keys({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().valid('open', 'in-progress', 'resolved', 'closed'),
      category: Joi.string().valid('ride', 'payment', 'technical', 'other'),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
      startDate: Joi.date(),
      endDate: Joi.date()
    })
  },

  getTicketById: {
    params: Joi.object().keys({
      id: Joi.string().required()
    })
  },

  updateTicket: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      subject: Joi.string(),
      description: Joi.string(),
      category: Joi.string().valid('ride', 'payment', 'technical', 'other'),
      priority: Joi.string().valid('low', 'medium', 'high', 'urgent')
    }).min(1)
  },

  updateTicketStatus: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      status: Joi.string().valid('open', 'in-progress', 'resolved', 'closed').required(),
      notes: Joi.string()
    })
  },

  assignTicket: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      assigneeId: Joi.string().required()
    })
  },

  addMessage: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      message: Joi.string().required(),
      type: Joi.string().valid('public', 'private', 'internal').default('public'),
      attachments: Joi.array().items(Joi.string())
    })
  },

  getFaq: {
    query: Joi.object().keys({
      category: Joi.string(),
      search: Joi.string(),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1)
    })
  }
};

module.exports = {
  ...supportValidation,
  supportValidation
};