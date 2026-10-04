/**
 * Document Verification Service
 * 
 * Handles all document-related operations including:
 * - Document upload and storage
 * - OCR and text extraction
 * - Document validation and verification
 * - Fraud detection and prevention
 * 
 * @version 1.0.0
 * @author Motsamai Team
 */

const AWS = require('aws-sdk');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const { promisify } = require('util');
const logger = require('../../config/logger');
const Redis = require('../../config/redis');
const { ValidationError, DocumentError, ServiceUnavailableError } = require('../../exceptions');

// Configuration
const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.AWS_S3_BUCKET || 'easygo-documents',
    documentAI: {
      projectId: process.env.DOCUMENT_AI_PROJECT_ID,
      location: process.env.DOCUMENT_AI_LOCATION || 'us',
      processorId: process.env.DOCUMENT_AI_PROCESSOR_ID,
    },
  },
  validation: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg'],
    maxDocumentsPerUser: 10,
    documentExpiryBufferDays: 30,
  },
  security: {
    encryptionKey: process.env.DOCUMENT_ENCRYPTION_KEY,
    ivLength: 16,
    algorithm: 'aes-256-cbc',
  },
};

// Initialize AWS services
let s3;
let documentAI;
let textract;

try {
  AWS.config.update({
    region: config.aws.region,
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  });

  s3 = new AWS.S3();
  textract = new AWS.Textract();
  documentAI = new AWS.DocumentAI();
} catch (error) {
  logger.error('Failed to initialize AWS services:', error);
  throw error;
}

/**
 * DocumentService class handles all document verification operations
 */
class DocumentService {
  constructor() {
    this.redisClient = Redis.getClient();
    this.uploadQueue = [];
    this.processingQueue = [];
    this.verificationCache = new Map();
    this.cacheTTL = 3600; // 1 hour
  }

  /**
   * Upload and process document
   * @param {Object} data - Document upload data
   * @param {string} data.userId - User ID
   * @param {string} data.documentType - Type of document (license, id, vehicle)
   * @param {string} data.fileUrl - URL or base64 of the document
   * @param {Object} data.metadata - Additional metadata
   * @returns {Promise<Object>} Processed document data
   */
  async uploadDocument(data) {
    const startTime = Date.now();
    const correlationId = data.correlationId || crypto.randomUUID();

    logger.info('Starting document upload', {
      correlationId,
      userId: data.userId,
      documentType: data.documentType,
      metadata: data.metadata,
    });

    try {
      // Validate input
      this._validateUploadData(data);

      const { userId, documentType, fileUrl, metadata = {} } = data;

      // Check user document limit
      await this._checkUserDocumentLimit(userId);

      // Download and validate file
      const fileBuffer = await this._downloadFile(fileUrl);
      const fileValidation = await this._validateFile(fileBuffer);

      if (!fileValidation.isValid) {
        throw new DocumentError('File validation failed', {
          reasons: fileValidation.reasons,
        });
      }

      // Generate unique document ID
      const documentId = this._generateDocumentId(userId, documentType);

      // Process document based on type
      let processedData = {};

      switch (documentType) {
        case 'driver_license':
          processedData = await this._processDriverLicense(fileBuffer, documentId);
          break;
        case 'national_id':
          processedData = await this._processNationalId(fileBuffer, documentId);
          break;
        case 'vehicle_registration':
          processedData = await this._processVehicleRegistration(fileBuffer, documentId);
          break;
        default:
          throw new DocumentError(`Unsupported document type: ${documentType}`);
      }

      // Encrypt sensitive data
      const encryptedData = this._encryptSensitiveData(processedData);

      // Store document in S3
      const s3Url = await this._uploadToS3(
        fileBuffer,
        documentId,
        documentType,
        userId
      );

      // Store document metadata in database
      const documentRecord = {
        id: documentId,
        userId,
        documentType,
        s3Url,
        metadata: {
          ...metadata,
          ...processedData.metadata,
          uploadedAt: new Date().toISOString(),
          fileValidation,
        },
        processedData: encryptedData,
        status: 'PROCESSED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this._storeDocumentRecord(documentRecord);

      // Cache document data
      await this._cacheDocument(documentId, documentRecord);

      // Queue for verification
      await this._queueForVerification(documentId);

      const result = {
        success: true,
        documentId,
        documentType,
        s3Url,
        processedData: {
          ...processedData,
          sensitiveData: '[REDACTED]',
        },
        status: 'PROCESSED',
        processingTime: Date.now() - startTime,
        correlationId,
      };

      logger.info('Document uploaded and processed successfully', {
        correlationId,
        documentId,
        documentType,
        userId,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Document upload failed', {
        correlationId,
        userId: data.userId,
        documentType: data.documentType,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Verify document authenticity
   * @param {string} documentId - Document ID
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyDocument(documentId, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Starting document verification', {
      correlationId,
      documentId,
      options,
    });

    try {
      if (!documentId) {
        throw new ValidationError('Document ID is required');
      }

      // Get document from cache or database
      let documentRecord = await this._getDocumentFromCache(documentId);
      
      if (!documentRecord) {
        documentRecord = await this._getDocumentFromDatabase(documentId);
        if (!documentRecord) {
          throw new DocumentError('Document not found', { documentId });
        }
        await this._cacheDocument(documentId, documentRecord);
      }

      // Perform verification based on document type
      let verificationResult;
      
      switch (documentRecord.documentType) {
        case 'driver_license':
          verificationResult = await this._verifyDriverLicense(documentRecord, options);
          break;
        case 'national_id':
          verificationResult = await this._verifyNationalId(documentRecord, options);
          break;
        case 'vehicle_registration':
          verificationResult = await this._verifyVehicleRegistration(documentRecord, options);
          break;
        default:
          throw new DocumentError(`Unsupported document type: ${documentRecord.documentType}`);
      }

      // Perform fraud detection
      const fraudScore = await this._detectFraud(documentRecord, verificationResult);

      // Validate against trusted sources
      const trustValidation = await this._validateAgainstTrustedSources(
        documentRecord,
        verificationResult
      );

      // Determine overall verification status
      const isVerified = this._determineVerificationStatus(
        verificationResult,
        fraudScore,
        trustValidation
      );

      const result = {
        success: true,
        documentId,
        isVerified,
        verificationResult,
        fraudScore,
        trustValidation,
        status: isVerified ? 'VERIFIED' : 'FAILED',
        score: verificationResult.confidenceScore || 0,
        flags: verificationResult.flags || [],
        processingTime: Date.now() - startTime,
        correlationId,
      };

      // Update document status
      await this._updateDocumentStatus(documentId, result);

      logger.info('Document verification completed', {
        correlationId,
        documentId,
        isVerified,
        score: result.score,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Document verification failed', {
        correlationId,
        documentId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Extract text from document using OCR
   * @param {string} documentId - Document ID
   * @param {Object} options - OCR options
   * @returns {Promise<Object>} Extracted text data
   */
  async extractText(documentId, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Starting text extraction', {
      correlationId,
      documentId,
      options,
    });

    try {
      if (!documentId) {
        throw new ValidationError('Document ID is required');
      }

      // Get document from cache or database
      let documentRecord = await this._getDocumentFromCache(documentId);
      
      if (!documentRecord) {
        documentRecord = await this._getDocumentFromDatabase(documentId);
        if (!documentRecord) {
          throw new DocumentError('Document not found', { documentId });
        }
      }

      // Get document from S3
      const fileBuffer = await this._downloadFromS3(documentRecord.s3Url);

      // Perform OCR using Textract
      const textractResult = await this._performOCR(fileBuffer, options);

      // Extract structured data based on document type
      const extractedData = this._extractStructuredData(
        textractResult,
        documentRecord.documentType
      );

      // Validate extracted data
      const validationResult = this._validateExtractedData(
        extractedData,
        documentRecord.documentType
      );

      const result = {
        success: true,
        documentId,
        documentType: documentRecord.documentType,
        extractedData,
        validation: validationResult,
        rawText: textractResult.text,
        confidenceScore: textractResult.confidenceScore || 0,
        processingTime: Date.now() - startTime,
        correlationId,
      };

      // Cache extracted data
      await this._cacheExtractedData(documentId, result);

      logger.info('Text extraction completed', {
        correlationId,
        documentId,
        confidenceScore: result.confidenceScore,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Text extraction failed', {
        correlationId,
        documentId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Validate document against trusted sources
   * @param {string} documentId - Document ID
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateAgainstTrustedSources(documentId, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Validating document against trusted sources', {
      correlationId,
      documentId,
      options,
    });

    try {
      if (!documentId) {
        throw new ValidationError('Document ID is required');
      }

      // Get document data
      const documentRecord = await this._getDocumentFromCache(documentId) ||
        await this._getDocumentFromDatabase(documentId);

      if (!documentRecord) {
        throw new DocumentError('Document not found', { documentId });
      }

      // Decrypt processed data
      const processedData = this._decryptSensitiveData(
        documentRecord.processedData
      );

      // Validate against different sources
      const results = {
        governmentValidation: await this._validateWithGovernment(processedData),
        thirdPartyValidation: await this._validateWithThirdParty(processedData),
        internalValidation: await this._validateInternally(processedData),
      };

      // Aggregate results
      const isValid = Object.values(results).every(r => r.isValid);
      const confidenceScore = this._calculateValidationScore(results);

      const result = {
        success: true,
        documentId,
        isValid,
        confidenceScore,
        details: results,
        flags: this._generateValidationFlags(results),
        processingTime: Date.now() - startTime,
        correlationId,
      };

      logger.info('Trusted source validation completed', {
        correlationId,
        documentId,
        isValid,
        confidenceScore: result.confidenceScore,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Trusted source validation failed', {
        correlationId,
        documentId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  // ============ Private Helper Methods ============

  /**
   * Validate upload data
   * @private
   */
  _validateUploadData(data) {
    const required = ['userId', 'documentType', 'fileUrl'];
    const missing = required.filter(field => !data[field]);

    if (missing.length > 0) {
      throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
    }

    const validTypes = ['driver_license', 'national_id', 'vehicle_registration'];
    if (!validTypes.includes(data.documentType)) {
      throw new ValidationError(`Invalid document type. Must be one of: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Check user document limit
   * @private
   */
  async _checkUserDocumentLimit(userId) {
    try {
      // In production, query database for user's document count
      const count = 0; // Placeholder
      if (count >= config.validation.maxDocumentsPerUser) {
        throw new DocumentError('User has reached maximum document limit', {
          userId,
          limit: config.validation.maxDocumentsPerUser,
        });
      }
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }
      logger.warn('Failed to check user document limit:', error);
    }
  }

  /**
   * Download file from URL
   * @private
   */
  async _downloadFile(fileUrl) {
    const MAX_RETRIES = 3;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let response;

        if (fileUrl.startsWith('data:image')) {
          // Handle base64
          const base64Data = fileUrl.split(';base64,').pop();
          return Buffer.from(base64Data, 'base64');
        } else {
          // Handle URL
          response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5,
            headers: {
              'User-Agent': 'Motsamai-Document-Service/1.0',
            },
          });
        }

        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return Buffer.from(response.data);
      } catch (error) {
        lastError = error;
        logger.warn(`File download attempt ${attempt} failed:`, {
          fileUrl,
          error: error.message,
          attempt,
        });

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(`Failed to download file after ${MAX_RETRIES} attempts: ${lastError.message}`);
  }

  /**
   * Validate file
   * @private
   */
  async _validateFile(fileBuffer) {
    const reasons = [];

    // Check file size
    if (fileBuffer.length > config.validation.maxFileSize) {
      reasons.push(`File size ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum ${config.validation.maxFileSize / 1024 / 1024}MB`);
    }

    // Check file type
    let mimeType;
    try {
      const metadata = await sharp(fileBuffer).metadata();
      mimeType = metadata.format ? `image/${metadata.format}` : null;
      
      if (!mimeType || !config.validation.allowedMimeTypes.includes(mimeType)) {
        reasons.push(`File type ${mimeType || 'unknown'} is not allowed. Allowed types: ${config.validation.allowedMimeTypes.join(', ')}`);
      }

      // Check image dimensions
      if (metadata.width && metadata.height) {
        if (metadata.width < 200 || metadata.height < 200) {
          reasons.push(`Image dimensions ${metadata.width}x${metadata.height} are too small. Minimum: 200x200`);
        }
      }
    } catch (error) {
      reasons.push('Failed to validate file type');
    }

    return {
      isValid: reasons.length === 0,
      reasons,
      size: fileBuffer.length,
      mimeType,
    };
  }

  /**
   * Generate unique document ID
   * @private
   */
  _generateDocumentId(userId, documentType) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${documentType}-${userId}-${timestamp}-${random}`;
  }

  /**
   * Process driver license
   * @private
   */
  async _processDriverLicense(fileBuffer, documentId) {
    const metadata = {
      type: 'driver_license',
      processedAt: new Date().toISOString(),
    };

    try {
      // Extract data using OCR
      const textractResult = await this._performOCR(fileBuffer);
      
      const extractedData = {
        licenseNumber: this._extractField(textractResult, ['license', 'number', 'id']),
        fullName: this._extractField(textractResult, ['name', 'full', 'driver']),
        dateOfBirth: this._extractField(textractResult, ['birth', 'date', 'dob']),
        issueDate: this._extractField(textractResult, ['issue', 'issued']),
        expiryDate: this._extractField(textractResult, ['expiry', 'expiration', 'expires']),
        licenseClass: this._extractField(textractResult, ['class', 'type']),
        issuingAuthority: this._extractField(textractResult, ['authority', 'issuing']),
        address: this._extractField(textractResult, ['address']),
      };

      // Validate extracted data
      const validation = this._validateDriverLicenseData(extractedData);

      return {
        ...extractedData,
        metadata: {
          ...metadata,
          validation,
          confidence: textractResult.confidenceScore || 0,
        },
      };
    } catch (error) {
      logger.error('Driver license processing failed:', error);
      return {
        metadata: {
          ...metadata,
          error: error.message,
          processingStatus: 'FAILED',
        },
      };
    }
  }

  /**
   * Process national ID
   * @private
   */
  async _processNationalId(fileBuffer, documentId) {
    const metadata = {
      type: 'national_id',
      processedAt: new Date().toISOString(),
    };

    try {
      const textractResult = await this._performOCR(fileBuffer);
      
      const extractedData = {
        idNumber: this._extractField(textractResult, ['id', 'number', 'national']),
        fullName: this._extractField(textractResult, ['name', 'full']),
        dateOfBirth: this._extractField(textractResult, ['birth', 'date', 'dob']),
        gender: this._extractField(textractResult, ['gender', 'sex']),
        nationality: this._extractField(textractResult, ['nationality', 'nation']),
        issueDate: this._extractField(textractResult, ['issue', 'issued']),
        expiryDate: this._extractField(textractResult, ['expiry', 'expiration']),
        address: this._extractField(textractResult, ['address']),
      };

      const validation = this._validateNationalIdData(extractedData);

      return {
        ...extractedData,
        metadata: {
          ...metadata,
          validation,
          confidence: textractResult.confidenceScore || 0,
        },
      };
    } catch (error) {
      logger.error('National ID processing failed:', error);
      return {
        metadata: {
          ...metadata,
          error: error.message,
          processingStatus: 'FAILED',
        },
      };
    }
  }

  /**
   * Process vehicle registration
   * @private
   */
  async _processVehicleRegistration(fileBuffer, documentId) {
    const metadata = {
      type: 'vehicle_registration',
      processedAt: new Date().toISOString(),
    };

    try {
      const textractResult = await this._performOCR(fileBuffer);
      
      const extractedData = {
        registrationNumber: this._extractField(textractResult, ['registration', 'plate', 'number']),
        vehicleMake: this._extractField(textractResult, ['make', 'brand']),
        vehicleModel: this._extractField(textractResult, ['model']),
        vehicleYear: this._extractField(textractResult, ['year']),
        vin: this._extractField(textractResult, ['vin', 'chassis']),
        ownerName: this._extractField(textractResult, ['owner', 'name']),
        registrationDate: this._extractField(textractResult, ['registration', 'date']),
        expiryDate: this._extractField(textractResult, ['expiry', 'expiration']),
      };

      const validation = this._validateVehicleData(extractedData);

      return {
        ...extractedData,
        metadata: {
          ...metadata,
          validation,
          confidence: textractResult.confidenceScore || 0,
        },
      };
    } catch (error) {
      logger.error('Vehicle registration processing failed:', error);
      return {
        metadata: {
          ...metadata,
          error: error.message,
          processingStatus: 'FAILED',
        },
      };
    }
  }

  /**
   * Perform OCR using AWS Textract
   * @private
   */
  async _performOCR(fileBuffer, options = {}) {
    try {
      const params = {
        Document: {
          Bytes: fileBuffer,
        },
        FeatureTypes: ['FORMS', 'TABLES'],
      };

      const response = await textract.analyzeDocument(params).promise();

      // Extract text and structure
      const text = response.Blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join(' ');

      // Extract key-value pairs
      const keyValues = {};
      response.Blocks
        .filter(block => block.BlockType === 'KEY_VALUE_SET')
        .forEach(block => {
          if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
            const key = block.Relationships
              .filter(rel => rel.Type === 'VALUE')
              .flatMap(rel => rel.Ids)
              .map(id => response.Blocks.find(b => b.Id === id))
              .filter(b => b)
              .map(b => b.Text)
              .join(' ');
            keyValues[key] = keyValues[key] || [];
          }
        });

      return {
        text,
        keyValues,
        blocks: response.Blocks,
        confidenceScore: this._calculateOCRConfidence(response.Blocks),
        pageCount: 1,
      };
    } catch (error) {
      logger.error('OCR failed:', error);
      throw new DocumentError('OCR processing failed', { originalError: error.message });
    }
  }

  /**
   * Calculate OCR confidence
   * @private
   */
  _calculateOCRConfidence(blocks) {
    const textBlocks = blocks.filter(block => block.BlockType === 'LINE');
    if (textBlocks.length === 0) return 0;
    
    const totalConfidence = textBlocks.reduce((sum, block) => sum + (block.Confidence || 0), 0);
    return totalConfidence / textBlocks.length;
  }

  /**
   * Extract field from OCR result
   * @private
   */
  _extractField(ocrResult, keywords) {
    const text = ocrResult.text || '';
    const lines = text.split('\n');

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const keyword of keywords) {
        if (lowerLine.includes(keyword)) {
          // Extract the value after the keyword
          const parts = line.split(':');
          if (parts.length > 1) {
            return parts.slice(1).join(':').trim();
          } else {
            // Try to extract from the same line
            const wordIndex = lowerLine.indexOf(keyword);
            const remaining = line.substring(wordIndex + keyword.length);
            return remaining.trim();
          }
        }
      }
    }

    return null;
  }

  /**
   * Validate driver license data
   * @private
   */
  _validateDriverLicenseData(data) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!data.licenseNumber) {
      errors.push('License number is required');
    }
    if (!data.fullName) {
      errors.push('Full name is required');
    }
    if (!data.dateOfBirth) {
      errors.push('Date of birth is required');
    }
    if (!data.expiryDate) {
      errors.push('Expiry date is required');
    }

    // Validate date formats
    if (data.expiryDate) {
      const expiryDate = new Date(data.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        warnings.push('Expiry date format is invalid');
      } else if (expiryDate < new Date()) {
        errors.push('License has expired');
      } else {
        const daysUntilExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry < config.validation.documentExpiryBufferDays) {
          warnings.push(`License expires in ${daysUntilExpiry} days`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
    };
  }

  /**
   * Validate national ID data
   * @private
   */
  _validateNationalIdData(data) {
    const errors = [];
    const warnings = [];

    if (!data.idNumber) {
      errors.push('ID number is required');
    }
    if (!data.fullName) {
      errors.push('Full name is required');
    }
    if (!data.dateOfBirth) {
      errors.push('Date of birth is required');
    }

    // Basic ID number format validation
    if (data.idNumber && data.idNumber.length < 6) {
      warnings.push('ID number seems too short');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
    };
  }

  /**
   * Validate vehicle data
   * @private
   */
  _validateVehicleData(data) {
    const errors = [];
    const warnings = [];

    if (!data.registrationNumber) {
      errors.push('Registration number is required');
    }
    if (!data.vehicleMake) {
      errors.push('Vehicle make is required');
    }
    if (!data.vehicleModel) {
      errors.push('Vehicle model is required');
    }
    if (!data.vehicleYear) {
      errors.push('Vehicle year is required');
    }

    // Validate year
    if (data.vehicleYear) {
      const year = parseInt(data.vehicleYear);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1900 || year > currentYear) {
        warnings.push('Vehicle year seems invalid');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
    };
  }

  /**
   * Verify driver license
   * @private
   */
  async _verifyDriverLicense(documentRecord, options = {}) {
    const processedData = this._decryptSensitiveData(documentRecord.processedData);
    const flags = [];
    let confidenceScore = 0;

    // Verify license number format
    if (processedData.licenseNumber) {
      const isValidFormat = this._validateLicenseNumberFormat(processedData.licenseNumber);
      if (!isValidFormat) {
        flags.push('INVALID_LICENSE_FORMAT');
      } else {
        confidenceScore += 25;
      }
    }

    // Verify expiry date
    if (processedData.expiryDate) {
      const expiryDate = new Date(processedData.expiryDate);
      if (!isNaN(expiryDate.getTime())) {
        if (expiryDate < new Date()) {
          flags.push('EXPIRED_LICENSE');
        } else {
          confidenceScore += 25;
        }
      }
    }

    // Verify license class
    if (processedData.licenseClass) {
      const validClasses = ['A', 'B', 'C', 'D', 'E'];
      if (validClasses.includes(processedData.licenseClass.toUpperCase())) {
        confidenceScore += 25;
      } else {
        flags.push('INVALID_LICENSE_CLASS');
      }
    }

    // Verify issuing authority
    if (processedData.issuingAuthority) {
      // In production, check against government database
      confidenceScore += 25;
    }

    return {
      isVerified: flags.length === 0,
      confidenceScore,
      flags,
      details: processedData,
    };
  }

  /**
   * Verify national ID
   * @private
   */
  async _verifyNationalId(documentRecord, options = {}) {
    const processedData = this._decryptSensitiveData(documentRecord.processedData);
    const flags = [];
    let confidenceScore = 0;

    // Verify ID number format
    if (processedData.idNumber) {
      const isValidFormat = this._validateIdNumberFormat(processedData.idNumber);
      if (!isValidFormat) {
        flags.push('INVALID_ID_FORMAT');
      } else {
        confidenceScore += 30;
      }
    }

    // Verify date of birth
    if (processedData.dateOfBirth) {
      const dob = new Date(processedData.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        const age = (new Date() - dob) / (1000 * 60 * 60 * 24 * 365.25);
        if (age < 18) {
          flags.push('UNDERAGE_DRIVER');
        } else {
          confidenceScore += 30;
        }
      }
    }

    // Verify nationality
    if (processedData.nationality) {
      // In production, check against allowed nationalities
      confidenceScore += 20;
    }

    // Verify address
    if (processedData.address) {
      confidenceScore += 20;
    }

    return {
      isVerified: flags.length === 0,
      confidenceScore,
      flags,
      details: processedData,
    };
  }

  /**
   * Verify vehicle registration
   * @private
   */
  async _verifyVehicleRegistration(documentRecord, options = {}) {
    const processedData = this._decryptSensitiveData(documentRecord.processedData);
    const flags = [];
    let confidenceScore = 0;

    // Verify registration number
    if (processedData.registrationNumber) {
      const isValidFormat = this._validateRegistrationFormat(processedData.registrationNumber);
      if (!isValidFormat) {
        flags.push('INVALID_REGISTRATION_FORMAT');
      } else {
        confidenceScore += 25;
      }
    }

    // Verify VIN
    if (processedData.vin) {
      const isValidVIN = this._validateVIN(processedData.vin);
      if (!isValidVIN) {
        flags.push('INVALID_VIN');
      } else {
        confidenceScore += 25;
      }
    }

    // Verify registration date
    if (processedData.registrationDate) {
      const regDate = new Date(processedData.registrationDate);
      if (!isNaN(regDate.getTime())) {
        if (regDate > new Date()) {
          flags.push('FUTURE_REGISTRATION_DATE');
        } else {
          confidenceScore += 25;
        }
      }
    }

    // Verify owner name
    if (processedData.ownerName) {
      confidenceScore += 25;
    }

    return {
      isVerified: flags.length === 0,
      confidenceScore,
      flags,
      details: processedData,
    };
  }

  /**
   * Detect fraud in document
   * @private
   */
  async _detectFraud(documentRecord, verificationResult) {
    let fraudScore = 0;
    const flags = [];

    // Check for duplicate documents
    const isDuplicate = await this._checkForDuplicate(documentRecord);
    if (isDuplicate) {
      fraudScore += 30;
      flags.push('DUPLICATE_DOCUMENT');
    }

    // Check for document tampering
    const isTampered = await this._checkForTampering(documentRecord);
    if (isTampered) {
      fraudScore += 40;
      flags.push('TAMPERED_DOCUMENT');
    }

    // Check for suspicious metadata
    const suspiciousMetadata = await this._checkSuspiciousMetadata(documentRecord);
    if (suspiciousMetadata) {
      fraudScore += 20;
      flags.push('SUSPICIOUS_METADATA');
    }

    // Check verification flags
    if (verificationResult.flags && verificationResult.flags.length > 0) {
      fraudScore += 10 * verificationResult.flags.length;
      flags.push(...verificationResult.flags);
    }

    return {
      score: Math.min(fraudScore, 100),
      flags,
      isSuspicious: fraudScore >= 40,
      isFraudulent: fraudScore >= 70,
    };
  }

  /**
   * Validate against trusted sources
   * @private
   */
  async _validateAgainstTrustedSources(documentRecord, verificationResult) {
    const results = [];

    // Government database check
    try {
      const govResult = await this._checkGovernmentDatabase(documentRecord);
      results.push({
        source: 'government',
        isValid: govResult.isValid,
        details: govResult,
      });
    } catch (error) {
      logger.warn('Government database check failed:', error);
      results.push({
        source: 'government',
        isValid: false,
        error: error.message,
      });
    }

    // Third-party validation
    try {
      const thirdPartyResult = await this._checkThirdPartyDatabase(documentRecord);
      results.push({
        source: 'third_party',
        isValid: thirdPartyResult.isValid,
        details: thirdPartyResult,
      });
    } catch (error) {
      logger.warn('Third-party validation failed:', error);
      results.push({
        source: 'third_party',
        isValid: false,
        error: error.message,
      });
    }

    // Internal validation
    results.push({
      source: 'internal',
      isValid: verificationResult.isVerified,
      details: {
        confidenceScore: verificationResult.confidenceScore,
        flags: verificationResult.flags,
      },
    });

    return {
      results,
      isPassed: results.every(r => r.isValid),
      confidenceScore: results.reduce((sum, r) => sum + (r.details?.confidenceScore || 0), 0) / results.length,
    };
  }

  /**
   * Determine verification status
   * @private
   */
  _determineVerificationStatus(verificationResult, fraudScore, trustValidation) {
    // Must pass verification
    if (!verificationResult.isVerified) {
      return false;
    }

    // Must pass fraud detection
    if (fraudScore.isFraudulent) {
      return false;
    }

    // Must pass trust validation
    if (!trustValidation.isPassed) {
      return false;
    }

    return true;
  }

  /**
   * Validate license number format
   * @private
   */
  _validateLicenseNumberFormat(licenseNumber) {
    // Example: ALA-12345 or 12-34567
    const patterns = [
      /^[A-Z]{1,3}-?\d{4,8}$/i,
      /^\d{2,3}-?\d{4,8}$/,
    ];
    return patterns.some(pattern => pattern.test(licenseNumber));
  }

  /**
   * Validate ID number format
   * @private
   */
  _validateIdNumberFormat(idNumber) {
    // Example: 1234567890 or A-1234567
    const patterns = [
      /^\d{6,15}$/,
      /^[A-Z]-?\d{6,12}$/i,
    ];
    return patterns.some(pattern => pattern.test(idNumber));
  }

  /**
   * Validate registration format
   * @private
   */
  _validateRegistrationFormat(registrationNumber) {
    // Example: ABC-123 or 12-345-AB
    const patterns = [
      /^[A-Z]{1,3}-?\d{3,5}$/i,
      /^\d{2,4}-?\d{3,5}-?[A-Z]{1,2}$/i,
    ];
    return patterns.some(pattern => pattern.test(registrationNumber));
  }

  /**
   * Validate VIN
   * @private
   */
  _validateVIN(vin) {
    // VIN must be 17 characters
    if (!vin || vin.length !== 17) {
      return false;
    }

    // Must not contain I, O, Q
    const invalidChars = ['I', 'O', 'Q'];
    if (invalidChars.some(char => vin.includes(char))) {
      return false;
    }

    // Must be alphanumeric
    if (!/^[A-Z0-9]{17}$/.test(vin)) {
      return false;
    }

    return true;
  }

  /**
   * Extract structured data from OCR result
   * @private
   */
  _extractStructuredData(ocrResult, documentType) {
    // This would be more sophisticated in production
    return {
      rawText: ocrResult.text,
      keyValues: ocrResult.keyValues,
      confidence: ocrResult.confidenceScore,
    };
  }

  /**
   * Validate extracted data
   * @private
   */
  _validateExtractedData(extractedData, documentType) {
    const errors = [];

    if (!extractedData.rawText || extractedData.rawText.length < 10) {
      errors.push('Insufficient text extracted');
    }

    if (extractedData.confidence < 50) {
      errors.push('Low OCR confidence');
    }

    return {
      isValid: errors.length === 0,
      errors,
      confidenceScore: extractedData.confidence,
    };
  }

  /**
   * Validate with government database
   * @private
   */
  async _validateWithGovernment(processedData) {
    // In production, call government API
    // This is a simulation
    return {
      isValid: true,
      confidenceScore: 95,
      message: 'Validation passed',
    };
  }

  /**
   * Validate with third-party
   * @private
   */
  async _validateWithThirdParty(processedData) {
    // In production, call third-party API
    return {
      isValid: true,
      confidenceScore: 90,
      message: 'Validation passed',
    };
  }

  /**
   * Validate internally
   * @private
   */
  async _validateInternally(processedData) {
    // Internal validation logic
    const checks = {
      hasRequiredFields: processedData && Object.keys(processedData).length > 0,
      dataQuality: true,
    };

    return {
      isValid: checks.hasRequiredFields && checks.dataQuality,
      confidenceScore: 85,
      details: checks,
    };
  }

  /**
   * Calculate validation score
   * @private
   */
  _calculateValidationScore(results) {
    const scores = Object.values(results).map(r => r.confidenceScore || 0);
    return scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
  }

  /**
   * Generate validation flags
   * @private
   */
  _generateValidationFlags(results) {
    const flags = [];
    for (const [source, result] of Object.entries(results)) {
      if (!result.isValid) {
        flags.push(`${source.toUpperCase()}_VALIDATION_FAILED`);
      }
    }
    return flags;
  }

  /**
   * Check for duplicate documents
   * @private
   */
  async _checkForDuplicate(documentRecord) {
    // In production, check database for duplicates
    return false;
  }

  /**
   * Check for document tampering
   * @private
   */
  async _checkForTampering(documentRecord) {
    // In production, analyze document for tampering
    return false;
  }

  /**
   * Check suspicious metadata
   * @private
   */
  async _checkSuspiciousMetadata(documentRecord) {
    // Check for suspicious patterns
    const metadata = documentRecord.metadata || {};
    const suspicious = [];

    if (metadata.uploadedAt) {
      const uploadTime = new Date(metadata.uploadedAt).getHours();
      if (uploadTime < 1 || uploadTime > 5) {
        suspicious.push('SUSPICIOUS_UPLOAD_TIME');
      }
    }

    return suspicious.length > 0;
  }

  /**
   * Check government database
   * @private
   */
  async _checkGovernmentDatabase(documentRecord) {
    // In production, this would be a real API call
    return {
      isValid: true,
      confidenceScore: 95,
    };
  }

  /**
   * Check third-party database
   * @private
   */
  async _checkThirdPartyDatabase(documentRecord) {
    // In production, this would be a real API call
    return {
      isValid: true,
      confidenceScore: 90,
    };
  }

  /**
   * Upload to S3
   * @private
   */
  async _uploadToS3(fileBuffer, documentId, documentType, userId) {
    const key = `documents/${userId}/${documentType}/${documentId}.jpg`;
    
    const params = {
      Bucket: config.aws.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: 'image/jpeg',
      Metadata: {
        'document-id': documentId,
        'document-type': documentType,
        'user-id': userId,
        'uploaded-at': new Date().toISOString(),
      },
      ServerSideEncryption: 'AES256',
    };

    try {
      const result = await s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw new DocumentError('Failed to upload document to S3', { originalError: error.message });
    }
  }

  /**
   * Download from S3
   * @private
   */
  async _downloadFromS3(s3Url) {
    const key = s3Url.split(`${config.aws.bucketName}/`).pop() || s3Url.split('.com/').pop();
    
    const params = {
      Bucket: config.aws.bucketName,
      Key: key,
    };

    try {
      const result = await s3.getObject(params).promise();
      return result.Body;
    } catch (error) {
      logger.error('S3 download failed:', error);
      throw new DocumentError('Failed to download document from S3', { originalError: error.message });
    }
  }

  /**
   * Store document record in database
   * @private
   */
  async _storeDocumentRecord(documentRecord) {
    // In production, store in database
    logger.info('Storing document record:', documentRecord.id);
    return documentRecord;
  }

  /**
   * Get document from database
   * @private
   */
  async _getDocumentFromDatabase(documentId) {
    // In production, query database
    return null;
  }

  /**
   * Get document from cache
   * @private
   */
  async _getDocumentFromCache(documentId) {
    try {
      const cacheKey = `document:${documentId}`;
      const cached = await this.redisClient.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get document from cache:', error);
      return null;
    }
  }

  /**
   * Cache document
   * @private
   */
  async _cacheDocument(documentId, documentRecord) {
    try {
      const cacheKey = `document:${documentId}`;
      await this.redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(documentRecord));
    } catch (error) {
      logger.warn('Failed to cache document:', error);
    }
  }

  /**
   * Queue for verification
   * @private
   */
  async _queueForVerification(documentId) {
    // In production, add to queue
    logger.info('Document queued for verification:', documentId);
  }

  /**
   * Update document status
   * @private
   */
  async _updateDocumentStatus(documentId, result) {
    // In production, update database
    logger.info('Document status updated:', { documentId, status: result.status });
  }

  /**
   * Cache extracted data
   * @private
   */
  async _cacheExtractedData(documentId, result) {
    try {
      const cacheKey = `extracted:${documentId}`;
      await this.redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    } catch (error) {
      logger.warn('Failed to cache extracted data:', error);
    }
  }

  /**
   * Encrypt sensitive data
   * @private
   */
  _encryptSensitiveData(data) {
    try {
      const iv = crypto.randomBytes(config.security.ivLength);
      const cipher = crypto.createCipheriv(
        config.security.algorithm,
        Buffer.from(config.security.encryptionKey, 'hex'),
        iv
      );
      
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(data), 'utf8'),
        cipher.final(),
      ]);

      return {
        iv: iv.toString('hex'),
        encryptedData: encrypted.toString('hex'),
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      return data; // Fallback to unencrypted
    }
  }

  /**
   * Decrypt sensitive data
   * @private
   */
  _decryptSensitiveData(encryptedData) {
    try {
      if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedData) {
        return encryptedData || {};
      }

      const iv = Buffer.from(encryptedData.iv, 'hex');
      const encrypted = Buffer.from(encryptedData.encryptedData, 'hex');
      
      const decipher = crypto.createDecipheriv(
        config.security.algorithm,
        Buffer.from(config.security.encryptionKey, 'hex'),
        iv
      );
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      logger.error('Decryption failed:', error);
      return {};
    }
  }

  /**
   * Handle errors
   * @private
   */
  _handleError(error) {
    if (error instanceof ValidationError ||
        error instanceof DocumentError ||
        error instanceof ServiceUnavailableError) {
      return error;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return new ServiceUnavailableError('Document service is currently unavailable');
    }

    return new DocumentError(`Document operation failed: ${error.message}`);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      logger.info('Document service cleaned up successfully');
    } catch (error) {
      logger.error('Error during document service cleanup:', error);
    }
  }
}

// Export singleton instance
module.exports = new DocumentService();