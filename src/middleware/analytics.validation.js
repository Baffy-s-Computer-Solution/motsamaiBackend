const Joi = require('joi');

const analyticsValidation = {
  getRideAnalytics: {
    query: Joi.object().keys({
      period: Joi.string().valid('day', 'week', 'month', 'year').default('day'),
      startDate: Joi.date(),
      endDate: Joi.date(),
      region: Joi.string(),
      vehicleType: Joi.string()
    })
  },

  getDemandPrediction: {
    query: Joi.object().keys({
      period: Joi.string().valid('hour', 'day', 'week').default('day'),
      latitude: Joi.number().required(),
      longitude: Joi.number().required(),
      radius: Joi.number().default(10)
    })
  }
};

module.exports = {
  ...analyticsValidation,
  analyticsValidation
};