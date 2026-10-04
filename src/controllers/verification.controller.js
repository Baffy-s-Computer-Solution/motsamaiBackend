/**
 * Verification Validator
 * 
 * Validates all verification-related requests including:
 * - Document upload validation
 * - Biometric verification validation
 * - Driver verification flow validation
 * - Admin review validation
 * 
 * @version 1.0.0
 * @author Motsamai Team
 */

const Joi = require('joi');
const { ValidationError } = require('../exceptions');
const logger = require('../config/logger');

/**
 * Verification Validator class
 */
class VerificationValidator {
  constructor() {
    this.schemas = {
      documentUpload: this._createDocumentUploadSchema(),
      biometricVerification: this._createBiometricVerificationSchema(),
      driverVerification: this._createDriverVerificationSchema(),
      adminReview: this._createAdminReviewSchema(),
      reVerification: this._createReVerificationSchema(),
      documentStatus: this._createDocumentStatusSchema(),
    };
  }

  /**
   * Validate document upload request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateDocumentUpload(data) {
    logger.info('Validating document upload request', { data: { ...data, file: data.file ? 'present' : 'missing' } });

    const { error, value } = this.schemas.documentUpload.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Document upload validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate biometric verification request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateBiometricVerification(data) {
    logger.info('Validating biometric verification request', { 
      data: {
        ...data,
        sourceImageUrl: data.sourceImageUrl ? '[REDACTED]' : null,
        targetImageUrl: data.targetImageUrl ? '[REDACTED]' : null,
        videoUrl: data.videoUrl ? '[REDACTED]' : null,
      }
    });

    const { error, value } = this.schemas.biometricVerification.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Biometric verification validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate driver verification start request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateDriverVerification(data) {
    logger.info('Validating driver verification request', { 
      data: {
        ...data,
        documents: data.documents ? `${data.documents.length} documents` : 'missing',
        biometric: data.biometric ? 'present' : 'missing',
      }
    });

    const { error, value } = this.schemas.driverVerification.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Driver verification validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate admin review request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateAdminReview(data) {
    logger.info('Validating admin review request', { 
      data: {
        ...data,
        notes: data.notes ? `${data.notes.length} chars` : null,
      }
    });

    const { error, value } = this.schemas.adminReview.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Admin review validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate re-verification request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateReVerification(data) {
    logger.info('Validating re-verification request', { data });

    const { error, value } = this.schemas.reVerification.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Re-verification validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate document status request
   * @param {Object} data - Request data
   * @returns {Object} Validated data
   */
  validateDocumentStatus(data) {
    logger.info('Validating document status request', { data });

    const { error, value } = this.schemas.documentStatus.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Document status validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate verification ID parameter
   * @param {string} verificationId - Verification ID
   * @returns {string} Validated verification ID
   */
  validateVerificationId(verificationId) {
    if (!verificationId) {
      throw new ValidationError('Verification ID is required');
    }

    if (typeof verificationId !== 'string') {
      throw new ValidationError('Verification ID must be a string');
    }

    // Check format (ver- prefix)
    if (!verificationId.startsWith('ver-')) {
      throw new ValidationError('Invalid verification ID format');
    }

    return verificationId;
  }

  /**
   * Validate document ID parameter
   * @param {string} documentId - Document ID
   * @returns {string} Validated document ID
   */
  validateDocumentId(documentId) {
    if (!documentId) {
      throw new ValidationError('Document ID is required');
    }

    if (typeof documentId !== 'string') {
      throw new ValidationError('Document ID must be a string');
    }

    // Check format (driver_license-, national_id-, vehicle_registration-)
    const validPrefixes = ['driver_license-', 'national_id-', 'vehicle_registration-'];
    const isValid = validPrefixes.some(prefix => documentId.startsWith(prefix));
    
    if (!isValid) {
      throw new ValidationError('Invalid document ID format');
    }

    return documentId;
  }

  // ============ Private Methods ============

  /**
   * Create document upload validation schema
   * @private
   */
  _createDocumentUploadSchema() {
    return Joi.object({
      documentType: Joi.string()
        .valid('driver_license', 'national_id', 'vehicle_registration')
        .required()
        .messages({
          'any.required': 'Document type is required',
          'any.only': 'Document type must be one of: driver_license, national_id, vehicle_registration',
        }),
      file: Joi.object({
        buffer: Joi.binary().required(),
        originalname: Joi.string().required(),
        mimetype: Joi.string()
          .valid('image/jpeg', 'image/png', 'image/jpg')
          .required()
          .messages({
            'any.only': 'File must be JPEG or PNG',
          }),
        size: Joi.number()
          .max(10 * 1024 * 1024) // 10MB
          .required()
          .messages({
            'number.max': 'File size must not exceed 10MB',
          }),
      }).required()
        .messages({
          'any.required': 'File is required',
        }),
      metadata: Joi.object({
        description: Joi.string().max(500).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        notes: Joi.string().max(1000).optional(),
      }).optional(),
    });
  }

  /**
   * Create biometric verification validation schema
   * @private
   */
  _createBiometricVerificationSchema() {
    return Joi.object({
      sourceImageUrl: Joi.string()
        .uri({ scheme: ['http', 'https', 'data'] })
        .optional()
        .messages({
          'string.uri': 'Source image URL must be a valid URL',
        }),
      targetImageUrl: Joi.string()
        .uri({ scheme: ['http', 'https', 'data'] })
        .required()
        .messages({
          'any.required': 'Target image URL is required',
          'string.uri': 'Target image URL must be a valid URL',
        }),
      videoUrl: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .optional()
        .messages({
          'string.uri': 'Video URL must be a valid URL',
        }),
      requireLiveness: Joi.boolean()
        .default(true)
        .optional(),
      storeReference: Joi.boolean()
        .default(false)
        .optional(),
      correlationId: Joi.string()
        .guid({ version: 'uuidv4' })
        .optional(),
    })
    .or('sourceImageUrl', 'targetImageUrl')
    .messages({
      'object.missing': 'At least one image URL is required',
    });
  }

  /**
   * Create driver verification validation schema
   * @private
   */
  _createDriverVerificationSchema() {
    const documentSchema = Joi.object({
      documentType: Joi.string()
        .valid('driver_license', 'national_id', 'vehicle_registration')
        .required(),
      fileUrl: Joi.string()
        .uri({ scheme: ['http', 'https', 'data'] })
        .required(),
      metadata: Joi.object().optional(),
    });

    const biometricSchema = Joi.object({
      sourceImageUrl: Joi.string()
        .uri({ scheme: ['http', 'https', 'data'] })
        .optional(),
      targetImageUrl: Joi.string()
        .uri({ scheme: ['http', 'https', 'data'] })
        .required(),
      videoUrl: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .optional(),
      requireLiveness: Joi.boolean()
        .default(true)
        .optional(),
    });

    return Joi.object({
      documents: Joi.array()
        .items(documentSchema)
        .min(1)
        .max(10)
        .required()
        .messages({
          'array.min': 'At least one document is required',
          'array.max': 'Maximum 10 documents allowed',
          'any.required': 'Documents are required',
        }),
      biometric: biometricSchema.required()
        .messages({
          'any.required': 'Biometric data is required',
        }),
    });
  }

  /**
   * Create admin review validation schema
   * @private
   */
  _createAdminReviewSchema() {
    return Joi.object({
      status: Joi.string()
        .valid('APPROVED', 'REJECTED', 'FLAGGED')
        .required()
        .messages({
          'any.required': 'Status is required',
          'any.only': 'Status must be one of: APPROVED, REJECTED, FLAGGED',
        }),
      notes: Joi.string()
        .max(2000)
        .optional()
        .messages({
          'string.max': 'Notes must not exceed 2000 characters',
        }),
      verificationNotes: Joi.string()
        .max(500)
        .optional()
        .messages({
          'string.max': 'Verification notes must not exceed 500 characters',
        }),
      adminId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .optional(),
      flags: Joi.array()
        .items(Joi.string())
        .optional(),
    });
  }

  /**
   * Create re-verification validation schema
   * @private
   */
  _createReVerificationSchema() {
    return Joi.object({
      reason: Joi.string()
        .valid('scheduled', 'admin_triggered', 'security_concern', 'document_expiry')
        .default('scheduled')
        .messages({
          'any.only': 'Reason must be one of: scheduled, admin_triggered, security_concern, document_expiry',
        }),
      priority: Joi.string()
        .valid('low', 'medium', 'high', 'critical')
        .default('medium')
        .optional(),
    });
  }

  /**
   * Create document status validation schema
   * @private
   */
  _createDocumentStatusSchema() {
    return Joi.object({
      documentId: Joi.string()
        .required()
        .messages({
          'any.required': 'Document ID is required',
        }),
    });
  }

  /**
   * Format validation errors
   * @private
   */
  _formatValidationErrors(error) {
    const errors = {};

    if (error.details) {
      error.details.forEach(detail => {
        const path = detail.path.join('.');
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path].push(detail.message);
      });
    }

    return errors;
  }

  /**
   * Sanitize input data
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeData(data) {
    const sanitized = { ...data };

    // Remove potentially dangerous characters
    const sanitizeString = (value) => {
      if (typeof value === 'string') {
        return value
          .replace(/[<>]/g, '') // Remove < and >
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;')
          .replace(/\//g, '&#x2F;');
      }
      return value;
    };

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          result[key] = sanitizeString(value);
        } else if (Array.isArray(value)) {
          result[key] = value.map(item => sanitizeObject(item));
        } else if (typeof value === 'object' && value !== null) {
          result[key] = sanitizeObject(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Validate pagination parameters
   * @param {Object} query - Query parameters
   * @returns {Object} Validated pagination
   */
  validatePagination(query) {
    const schema = Joi.object({
      page: Joi.number()
        .integer()
        .min(1)
        .default(1)
        .optional(),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .optional(),
      status: Joi.string()
        .valid('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED', 'ALL')
        .default('PENDING')
        .optional(),
      sortBy: Joi.string()
        .valid('createdAt', 'updatedAt', 'status')
        .default('createdAt')
        .optional(),
      sortOrder: Joi.string()
        .valid('ASC', 'DESC')
        .default('DESC')
        .optional(),
    });

    const { error, value } = schema.validate(query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Pagination validation failed', { errors });
    }

    return value;
  }

  /**
   * Validate file upload
   * @param {Object} file - File object
   * @returns {boolean} Is valid
   */
  validateFile(file) {
    if (!file) {
      throw new ValidationError('File is required');
    }

    // Check file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new ValidationError(`File size exceeds maximum of ${maxSize / 1024 / 1024}MB`);
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file name
    const fileName = file.originalname || file.name;
    if (fileName) {
      const nameRegex = /^[a-zA-Z0-9\s\-_.()]+$/;
      if (!nameRegex.test(fileName)) {
        throw new ValidationError('File name contains invalid characters');
      }
    }

    return true;
  }

  /**
   * Validate face image quality
   * @param {Object} imageData - Image data
   * @returns {boolean} Is valid
   */
  validateFaceImage(imageData) {
    // Minimum requirements for face detection
    const minWidth = 200;
    const minHeight = 200;
    const maxSize = 10 * 1024 * 1024;

    if (!imageData || !imageData.buffer) {
      throw new ValidationError('Image data is required');
    }

    // Check dimensions
    if (imageData.width && imageData.height) {
      if (imageData.width < minWidth || imageData.height < minHeight) {
        throw new ValidationError(`Image must be at least ${minWidth}x${minHeight} pixels`);
      }
    }

    // Check size
    if (imageData.size && imageData.size > maxSize) {
      throw new ValidationError(`Image size exceeds maximum of ${maxSize / 1024 / 1024}MB`);
    }

    return true;
  }

  /**
   * Validate biometric session
   * @param {Object} sessionData - Session data
   * @returns {boolean} Is valid
   */
  validateBiometricSession(sessionData) {
    const schema = Joi.object({
      sessionId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .required(),
      userId: Joi.string()
        .uuid({ version: 'uuidv4' })
        .required(),
      timestamp: Joi.number()
        .integer()
        .min(Date.now() - 3600000) // Last hour
        .required(),
      status: Joi.string()
        .valid('INITIATED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED')
        .required(),
    });

    const { error } = schema.validate(sessionData);
    if (error) {
      const errors = this._formatValidationErrors(error);
      throw new ValidationError('Invalid biometric session', { errors });
    }

    return true;
  }
}

module.exports = new VerificationValidator();