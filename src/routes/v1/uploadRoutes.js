/**
 * Upload Routes
 * Version: 2.0.0
 * Description: File upload and management endpoints
 * 
 * @module routes/v1/uploadRoutes
 * @requires express
 * @requires controllers/uploadController
 * @requires middleware/auth
 * @requires middleware/authorizeRoles
 * @requires middleware/validate
 * @requires middleware/upload.validation
 * @requires middleware/rateLimiter
 * @requires middleware/requestLogger
 * @requires utils/fileUpload
 */

const express = require('express');
const router = express.Router();

// Controllers
const uploadController = require('../../controllers/uploadController');

// Middleware
const { auth } = require('../../middleware/auth');
const authorizeRoles = require('../../middleware/authorizeRoles');
const validate = require('../../middleware/validate');
const uploadValidation = require('../../middleware/upload.validation');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { requestLogger } = require('../../middleware/requestLogger');
const { cacheMiddleware } = require('../../middleware/cache');
const { upload } = require('../../utils/fileUpload');

/**
 * Apply authentication to all upload routes
 */
router.use(auth, requestLogger);

// =============================================================================
// SINGLE FILE UPLOAD
// =============================================================================

/**
 * @route POST /api/v1/uploads
 * @description Upload a single file
 * @access All authenticated users
 * @rateLimit 10 requests per minute per user
 * 
 * @formData {File} file - File to upload (max 10MB)
 * @body {string} [type] - File type (profile/vehicle/document/other)
 * @body {string} [purpose] - File purpose
 * @body {string} [description] - File description
 * @body {string} [entityId] - Associated entity ID
 * @body {string} [entityType] - Associated entity type
 * 
 * @returns {Object} Upload confirmation with file URL
 * 
 * @example
 * POST /api/v1/uploads
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Content-Type: multipart/form-data
 * formData: {
 *   "file": [file],
 *   "type": "profile",
 *   "description": "Profile picture"
 * }
 * Response: {
 *   "success": true,
 *   "data": {
 *     "fileId": "file_123",
 *     "url": "https://storage.example.com/files/photo.jpg",
 *     "filename": "photo.jpg",
 *     "size": 1024,
 *     "mimeType": "image/jpeg",
 *     "type": "profile"
 *   }
 * }
 */
router.post(
  '/',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many uploads, please slow down'
  }),
  upload.single('file'),
  validate(uploadValidation.uploadFile),
  uploadController.upload
);

// =============================================================================
// MULTIPLE FILE UPLOAD
// =============================================================================

/**
 * @route POST /api/v1/uploads/multiple
 * @description Upload multiple files
 * @access All authenticated users
 * @rateLimit 5 requests per minute per user
 * 
 * @formData {File[]} files - Files to upload (max 10 files, 10MB each)
 * @body {string} [type] - File type
 * @body {string} [purpose] - File purpose
 * @body {string} [description] - File description
 * @body {string} [entityId] - Associated entity ID
 * @body {string} [entityType] - Associated entity type
 * 
 * @returns {Object} Upload confirmation with file URLs
 * 
 * @example
 * POST /api/v1/uploads/multiple
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Content-Type: multipart/form-data
 * formData: {
 *   "files": [file1, file2],
 *   "type": "document",
 *   "entityId": "drv_123"
 * }
 */
router.post(
  '/multiple',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many batch uploads, please slow down'
  }),
  upload.array('files', 10),
  validate(uploadValidation.uploadMultipleFiles),
  uploadController.uploadMultiple
);

// =============================================================================
// IMAGE UPLOAD (WITH OPTIMIZATION)
// =============================================================================

/**
 * @route POST /api/v1/uploads/image
 * @description Upload and optimize an image
 * @access All authenticated users
 * @rateLimit 10 requests per minute per user
 * 
 * @formData {File} image - Image file (max 10MB)
 * @body {number} [width] - Desired width (auto scaled)
 * @body {number} [height] - Desired height (auto scaled)
 * @body {string} [quality] - Image quality (low/medium/high)
 * @body {string} [format] - Output format (jpeg/png/webp)
 * @body {string} [type] - Image type (profile/vehicle/incident/other)
 * @body {string} [entityId] - Associated entity ID
 * @body {string} [entityType] - Associated entity type
 * 
 * @returns {Object} Upload confirmation with optimized image URL
 * 
 * @example
 * POST /api/v1/uploads/image
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Content-Type: multipart/form-data
 * formData: {
 *   "image": [file],
 *   "width": 800,
 *   "quality": "medium",
 *   "type": "profile"
 * }
 */
router.post(
  '/image',
  rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many image uploads, please slow down'
  }),
  upload.single('image'),
  validate(uploadValidation.uploadImage),
  uploadController.uploadImage
);

// =============================================================================
// FILE MANAGEMENT
// =============================================================================

/**
 * @route GET /api/v1/uploads
 * @description Get user's uploaded files
 * @access All authenticated users
 * 
 * @queryParam {number} [page=1] - Page number
 * @queryParam {number} [limit=20] - Items per page
 * @queryParam {string} [type] - Filter by file type
 * @queryParam {string} [entityId] - Filter by entity ID
 * @queryParam {string} [entityType] - Filter by entity type
 * 
 * @returns {Object} Paginated file list
 * 
 * @example
 * GET /api/v1/uploads?page=1&type=profile
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/',
  validate(uploadValidation.listFiles),
  uploadController.listFiles
);

/**
 * @route GET /api/v1/uploads/:id
 * @description Get file details
 * @access All authenticated users
 * @cache 1 minute
 * 
 * @param {string} id - File ID
 * @returns {Object} File details
 * 
 * @example
 * GET /api/v1/uploads/file_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id',
  cacheMiddleware({ ttl: 60 }),
  validate(uploadValidation.getFileById),
  uploadController.getFileById
);

/**
 * @route GET /api/v1/uploads/:id/download
 * @description Download a file
 * @access All authenticated users
 * 
 * @param {string} id - File ID
 * @returns {File} File download
 * 
 * @example
 * GET /api/v1/uploads/file_123/download
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/:id/download',
  validate(uploadValidation.downloadFile),
  uploadController.downloadFile
);

/**
 * @route DELETE /api/v1/uploads/:id
 * @description Delete a file
 * @access File owner, Admin
 * 
 * @param {string} id - File ID
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Deletion confirmation
 * 
 * @example
 * DELETE /api/v1/uploads/file_123
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "reason": "File no longer needed" }
 */
router.delete(
  '/:id',
  validate(uploadValidation.deleteFile),
  uploadController.deleteFile
);

// =============================================================================
// BULK FILE OPERATIONS
// =============================================================================

/**
 * @route DELETE /api/v1/uploads/bulk
 * @description Delete multiple files
 * @access Admin only
 * 
 * @body {string[]} fileIds - File IDs to delete
 * @body {string} [reason] - Deletion reason
 * 
 * @returns {Object} Bulk deletion confirmation
 * 
 * @example
 * DELETE /api/v1/uploads/bulk
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 * Body: { "fileIds": ["file_123", "file_456"], "reason": "Cleanup" }
 */
router.delete(
  '/bulk',
  authorizeRoles('admin'),
  validate(uploadValidation.bulkDeleteFiles),
  uploadController.bulkDelete
);

// =============================================================================
// FILE STATISTICS
// =============================================================================

/**
 * @route GET /api/v1/uploads/statistics
 * @description Get file upload statistics (admin only)
 * @access Admin only
 * @cache 5 minutes
 * 
 * @queryParam {string} [period=month] - Statistics period
 * @queryParam {string} [startDate] - Start date
 * @queryParam {string} [endDate] - End date
 * @queryParam {string} [type] - Filter by file type
 * 
 * @returns {Object} File statistics
 * 
 * @example
 * GET /api/v1/uploads/statistics?period=month
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
router.get(
  '/statistics',
  authorizeRoles('admin'),
  cacheMiddleware({ ttl: 300 }),
  validate(uploadValidation.getUploadStatistics),
  uploadController.getStatistics
);

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * @route GET /api/v1/uploads/health
 * @description Health check for upload routes
 * @access Public
 * 
 * @returns {Object} Health status
 * 
 * @example
 * GET /api/v1/uploads/health
 * Response: { status: 'healthy', endpoint: '/api/v1/uploads', version: '2.0.0' }
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    endpoint: '/api/v1/uploads',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      fileUpload: 'operational',
      fileManagement: 'operational'
    }
  });
});

module.exports = router;
