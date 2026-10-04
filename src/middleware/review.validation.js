const Joi = require('joi');

const idParam = {
  params: Joi.object().keys({
    id: Joi.string().required(),
    responseId: Joi.string(),
  }).unknown(true),
};

const query = {
  query: Joi.object().unknown(true),
};

const body = {
  body: Joi.object().unknown(true),
};

const reviewValidation = {
  createReview: body,
  listReviews: query,
  getReviewById: idParam,
  updateReview: { ...idParam, ...body },
  deleteReview: idParam,
  respondToReview: { ...idParam, ...body },
  updateResponse: { ...idParam, ...body },
  deleteResponse: idParam,
  reportReview: { ...idParam, ...body },
  moderateReview: { ...idParam, ...body },
  getReviewStatistics: query,
  getSentimentAnalysis: query,
  getReviewTrends: query,
};

module.exports = {
  ...reviewValidation,
  reviewValidation,
};
