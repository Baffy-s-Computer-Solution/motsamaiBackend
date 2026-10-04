const Joi = require('joi');

/**
 * Promotion Validation Schemas
 */
const promotionValidation = {
  listPromotions: {
    query: Joi.object().keys({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      status: Joi.string().valid('active', 'expired', 'upcoming'),
      type: Joi.string().valid('percentage', 'fixed', 'free'),
      search: Joi.string()
    })
  },

  getAvailablePromotions: {
    query: Joi.object().keys({
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      rideType: Joi.string(),
      estimatedFare: Joi.number()
    })
  },

  validatePromotion: {
    body: Joi.object().keys({
      code: Joi.string().required().uppercase(),
      amount: Joi.number(),
      rideType: Joi.string()
    })
  },

  applyPromotion: {
    body: Joi.object().keys({
      code: Joi.string().required().uppercase(),
      rideId: Joi.string().required()
    })
  },

  createPromotion: {
    body: Joi.object().keys({
      name: Joi.string().required(),
      code: Joi.string().required().uppercase(),
      type: Joi.string().valid('percentage', 'fixed', 'free').required(),
      value: Joi.number().required(),
      description: Joi.string(),
      startDate: Joi.date().required(),
      endDate: Joi.date().required().greater(Joi.ref('startDate')),
      conditions: Joi.object().keys({
        minFare: Joi.number(),
        maxDiscount: Joi.number(),
        zones: Joi.array().items(Joi.string())
      }),
      usageLimits: Joi.object().keys({
        perUser: Joi.number().integer().min(1),
        total: Joi.number().integer().min(1)
      }),
      applicableRoles: Joi.array().items(Joi.string().valid('rider', 'driver')),
      metadata: Joi.object()
    })
  },

  updatePromotion: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      name: Joi.string(),
      description: Joi.string(),
      startDate: Joi.date(),
      endDate: Joi.date(),
      status: Joi.string().valid('active', 'inactive', 'expired'),
      conditions: Joi.object(),
      usageLimits: Joi.object()
    }).min(1)
  },

  updatePromotionStatus: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    body: Joi.object().keys({
      status: Joi.string().valid('active', 'inactive', 'expired').required(),
      reason: Joi.string()
    })
  },

  getPromotionAnalytics: {
    params: Joi.object().keys({
      id: Joi.string().required()
    }),
    query: Joi.object().keys({
      period: Joi.string().valid('day', 'week', 'month', 'year').default('month')
    })
  },

  savePromotion: {
    body: Joi.object().keys({
      promotionId: Joi.string().required()
    })
  }
};

module.exports = {
  ...promotionValidation,
  promotionValidation // Support both destructured and object-based imports
};