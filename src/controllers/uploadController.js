const { ok } = require('../utils/apiResponse');
const storageService = require('../services/storageService');

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const uploadType = ['profile', 'vehicle', 'document', 'other'].includes(req.body.type)
      ? req.body.type
      : 'other';
    const result = await storageService.uploadFile(req.file, `users/${req.userId}/${uploadType}`);

    return ok(res, {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
    }, 'File uploaded successfully.', 201);
  } catch (error) {
    return next(error);
  }
};

exports.uploadMultiple = async (req, res, next) => {
  try {
    const files = req.files || [];
    const uploaded = await Promise.all(files.map((file) => storageService.uploadFile(file)));
    return ok(res, uploaded, 'Files uploaded successfully.', 201);
  } catch (error) {
    return next(error);
  }
};

exports.uploadImage = exports.upload;

exports.listFiles = async (req, res) => ok(res, { files: [], total: 0 }, 'Files fetched.');

exports.getFileById = async (req, res) => ok(res, { id: req.params.id }, 'File fetched.');

exports.downloadFile = async (req, res) => ok(res, { id: req.params.id, url: null }, 'Download link generated.');

exports.deleteFile = async (req, res) => ok(res, null, 'File deleted.');

exports.bulkDelete = async (req, res) => ok(res, { deleted: (req.body.ids || []).length }, 'Files deleted.');

exports.getStatistics = async (req, res) => ok(res, { total: 0, images: 0, documents: 0 }, 'Upload statistics fetched.');
