const Joi = require('joi');

const idParam = {
  params: Joi.object().keys({
    id: Joi.string().required(),
    fileId: Joi.string(),
  }).unknown(true),
};

const query = {
  query: Joi.object().unknown(true),
};

const body = {
  body: Joi.object().unknown(true),
};

const uploadValidation = {
  uploadFile: body,
  uploadMultipleFiles: body,
  uploadImage: body,
  listFiles: query,
  getFileById: idParam,
  downloadFile: idParam,
  deleteFile: idParam,
  bulkDeleteFiles: body,
  getUploadStatistics: query,
};

module.exports = {
  ...uploadValidation,
  uploadValidation,
};
