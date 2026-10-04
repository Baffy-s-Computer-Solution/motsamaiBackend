const multer = require('multer');
const { uploadBuffer } = require('../adapters/storage.adapter');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_SIZE || 5 * 1024 * 1024),
  },
});

const uploadBufferToStorage = (fileBuffer, folder = 'motsamai/uploads', options = {}) => uploadBuffer(fileBuffer, folder, options);

const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError || error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'File upload failed',
      code: error.code || 'UPLOAD_ERROR',
    });
  }
  return next();
};

module.exports = {
  upload,
  uploadBufferToStorage,
  handleUploadError,
};
