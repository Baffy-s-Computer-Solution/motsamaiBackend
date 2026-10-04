const Joi = require('joi');

const idParam = {
  params: Joi.object().keys({
    id: Joi.string().required(),
    reportId: Joi.string(),
  }).unknown(true),
};

const query = {
  query: Joi.object().unknown(true),
};

const body = {
  body: Joi.object().unknown(true),
};

const reportValidation = {
  listReports: query,
  generateReport: body,
  getReportById: idParam,
  downloadReport: idParam,
  deleteReport: idParam,
  getRevenueReport: query,
  getPayoutReport: query,
  getTaxReport: query,
  getRideOperationsReport: query,
  getDriverPerformanceReport: query,
  getIncidentReport: query,
  getUserActivityReport: query,
  getUserRetentionReport: query,
  createCustomReport: body,
  getCustomReports: query,
  updateCustomReport: { ...idParam, ...body },
  deleteCustomReport: idParam,
};

module.exports = {
  ...reportValidation,
  reportValidation,
};
