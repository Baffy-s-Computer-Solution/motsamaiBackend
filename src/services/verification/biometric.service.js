/**
 * Biometric Verification Service
 * 
 * Handles all biometric operations including:
 * - Facial recognition and comparison
 * - Liveness detection
 * - Biometric data management
 * - Confidence scoring and validation
 * 
 * @version 1.0.0
 * @author Motsamai Team
 */

const AWS = require('aws-sdk');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../config/logger');
const Redis = require('../../config/redis');
const { promisify } = require('util');
const sharp = require('sharp');
const { ValidationError, BiometricError, ServiceUnavailableError } = require('../../exceptions');

// Configuration
const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.AWS_S3_BUCKET,
    rekognition: {
      minConfidence: parseInt(process.env.FACE_MATCH_THRESHOLD) || 85,
      maxRetries: 3,
      retryDelay: 1000,
    }
  },
  liveness: {
    apiKey: process.env.LIVENESS_API_KEY,
    apiUrl: process.env.LIVENESS_API_URL || 'https://api.liveness.com/v1',
    timeout: 30000,
    maxAttempts: 3,
  },
  security: {
    maxSelfieAttempts: 5,
    lockoutDuration: 30 * 60, // 30 minutes in seconds
    sessionTimeout: 15 * 60, // 15 minutes
  }
};

// Initialize AWS services
let rekognition;
let s3;

try {
  AWS.config.update({
    region: config.aws.region,
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  });

  rekognition = new AWS.Rekognition();
  s3 = new AWS.S3();
} catch (error) {
  logger.error('Failed to initialize AWS services:', error);
  throw error;
}

/**
 * BiometricService class handles all biometric verification operations
 */
class BiometricService {
  constructor() {
    this.redisClient = Redis.getClient();
    this.faceCompareCache = new Map();
    this.cacheTTL = 3600; // 1 hour
  }

  /**
   * Compare two faces and return similarity score
   * @param {string} sourceImageUrl - URL of the source image
   * @param {string} targetImageUrl - URL of the target image
   * @param {Object} options - Comparison options
   * @returns {Promise<Object>} Comparison result with confidence score
   */
  async compareFaces(sourceImageUrl, targetImageUrl, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Starting face comparison', {
      correlationId,
      sourceImageUrl,
      targetImageUrl,
      options,
    });

    try {
      // Validate input
      if (!sourceImageUrl || !targetImageUrl) {
        throw new ValidationError('Both source and target image URLs are required');
      }

      // Check cache first
      const cacheKey = this._generateCacheKey(sourceImageUrl, targetImageUrl);
      const cachedResult = await this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.info('Face comparison returned from cache', { correlationId, cacheKey });
        return {
          ...cachedResult,
          cached: true,
          processingTime: Date.now() - startTime,
        };
      }

      // Download and preprocess images
      const [sourceBuffer, targetBuffer] = await Promise.all([
        this._downloadImage(sourceImageUrl),
        this._downloadImage(targetImageUrl),
      ]);

      // Validate image quality
      const sourceQuality = await this._validateImageQuality(sourceBuffer);
      const targetQuality = await this._validateImageQuality(targetBuffer);

      if (!sourceQuality.isValid || !targetQuality.isValid) {
        throw new BiometricError('Image quality is insufficient for comparison', {
          sourceQuality: sourceQuality,
          targetQuality: targetQuality,
        });
      }

      // Preprocess images
      const processedSource = await this._preprocessImage(sourceBuffer);
      const processedTarget = await this._preprocessImage(targetBuffer);

      // Detect faces
      const [sourceFaces, targetFaces] = await Promise.all([
        this._detectFaces(processedSource),
        this._detectFaces(processedTarget),
      ]);

      if (sourceFaces.length === 0 || targetFaces.length === 0) {
        throw new BiometricError('No faces detected in one or both images', {
          sourceFacesCount: sourceFaces.length,
          targetFacesCount: targetFaces.length,
        });
      }

      // Use the most prominent face
      const sourceFace = this._getMostProminentFace(sourceFaces);
      const targetFace = this._getMostProminentFace(targetFaces);

      // Perform face comparison using AWS Rekognition
      const comparisonResult = await this._compareFacesWithRekognition(
        sourceFace,
        targetFace,
        options
      );

      // Validate confidence score
      const confidenceScore = comparisonResult.Confidence || 0;
      const isMatch = confidenceScore >= config.aws.rekognition.minConfidence;

      const result = {
        success: true,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        isMatch: isMatch,
        threshold: config.aws.rekognition.minConfidence,
        faceCount: {
          source: sourceFaces.length,
          target: targetFaces.length,
        },
        metadata: {
          sourceQuality,
          targetQuality,
          comparisonDetails: comparisonResult,
        },
        processingTime: Date.now() - startTime,
        correlationId,
      };

      // Cache the result
      await this._cacheResult(cacheKey, result);

      logger.info('Face comparison completed successfully', {
        correlationId,
        isMatch,
        confidenceScore,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Face comparison failed', {
        correlationId,
        error: error.message,
        stack: error.stack,
        sourceImageUrl,
        targetImageUrl,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Detect liveness from a video or image sequence
   * @param {string} videoUrl - URL of the video or image sequence
   * @param {Object} options - Liveness detection options
   * @returns {Promise<Object>} Liveness detection result
   */
  async detectLiveness(videoUrl, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Starting liveness detection', {
      correlationId,
      videoUrl,
      options,
    });

    try {
      if (!videoUrl) {
        throw new ValidationError('Video URL is required for liveness detection');
      }

      // Check if it's a video or multiple images
      const isVideo = this._isVideoUrl(videoUrl);

      let livenessResult;

      if (isVideo) {
        // Process video for liveness
        livenessResult = await this._processVideoLiveness(videoUrl, options);
      } else {
        // Process image sequence for liveness
        livenessResult = await this._processImageLiveness(videoUrl, options);
      }

      // Validate liveness result
      const isLive = livenessResult.confidenceScore >= 70; // 70% threshold

      const result = {
        success: true,
        isLive: isLive,
        confidenceScore: Math.round(livenessResult.confidenceScore * 100) / 100,
        livenessScore: livenessResult.livenessScore,
        spoofScore: livenessResult.spoofScore || 0,
        method: livenessResult.method || 'unknown',
        metadata: livenessResult.metadata || {},
        processingTime: Date.now() - startTime,
        correlationId,
      };

      logger.info('Liveness detection completed', {
        correlationId,
        isLive,
        confidenceScore: result.confidenceScore,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Liveness detection failed', {
        correlationId,
        error: error.message,
        stack: error.stack,
        videoUrl,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Perform combined biometric verification
   * @param {Object} data - Verification data
   * @returns {Promise<Object>} Combined verification result
   */
  async performCombinedVerification(data) {
    const startTime = Date.now();
    const correlationId = data.correlationId || crypto.randomUUID();

    logger.info('Starting combined biometric verification', {
      correlationId,
      data: { ...data, sourceImageUrl: '[REDACTED]', targetImageUrl: '[REDACTED]' },
    });

    try {
      const { sourceImageUrl, targetImageUrl, videoUrl, requireLiveness = true } = data;

      // Validate required data
      if (!sourceImageUrl || !targetImageUrl) {
        throw new ValidationError('Source and target image URLs are required');
      }

      const results = {
        faceComparison: null,
        livenessDetection: null,
        overall: {
          success: false,
          isVerified: false,
          score: 0,
          flags: [],
        },
      };

      // Perform face comparison
      try {
        results.faceComparison = await this.compareFaces(sourceImageUrl, targetImageUrl, {
          correlationId: `${correlationId}-face`,
          ...data,
        });
      } catch (error) {
        logger.error('Face comparison failed in combined verification', {
          correlationId,
          error: error.message,
        });
        results.overall.flags.push('FACE_COMPARISON_FAILED');
      }

      // Perform liveness detection if required
      if (requireLiveness && videoUrl) {
        try {
          results.livenessDetection = await this.detectLiveness(videoUrl, {
            correlationId: `${correlationId}-liveness`,
            ...data,
          });
        } catch (error) {
          logger.error('Liveness detection failed in combined verification', {
            correlationId,
            error: error.message,
          });
          results.overall.flags.push('LIVENESS_DETECTION_FAILED');
        }
      }

      // Calculate overall score
      let overallScore = 0;
      let componentsCount = 0;

      if (results.faceComparison && results.faceComparison.success) {
        const faceScore = results.faceComparison.confidenceScore / 100;
        overallScore += faceScore;
        componentsCount++;
      }

      if (results.livenessDetection && results.livenessDetection.success) {
        const livenessScore = results.livenessDetection.confidenceScore / 100;
        overallScore += livenessScore;
        componentsCount++;
      }

      // Calculate weighted score
      const weightedScore = componentsCount > 0 ? overallScore / componentsCount : 0;
      results.overall.score = Math.round(weightedScore * 100);

      // Determine verification status
      const isFaceMatched = results.faceComparison?.isMatch || false;
      const isLivenessPassed = results.livenessDetection?.isLive !== undefined
        ? results.livenessDetection.isLive
        : true; // If liveness not required, assume passed

      results.overall.isVerified = isFaceMatched && isLivenessPassed;
      results.overall.success = true;

      // Add additional flags
      if (isFaceMatched) {
        results.overall.flags.push('FACE_MATCHED');
      } else {
        results.overall.flags.push('FACE_MISMATCHED');
      }

      if (isLivenessPassed) {
        results.overall.flags.push('LIVENESS_PASSED');
      } else {
        results.overall.flags.push('LIVENESS_FAILED');
      }

      results.processingTime = Date.now() - startTime;
      results.correlationId = correlationId;

      logger.info('Combined biometric verification completed', {
        correlationId,
        isVerified: results.overall.isVerified,
        score: results.overall.score,
        flags: results.overall.flags,
        processingTime: results.processingTime,
      });

      return results;
    } catch (error) {
      logger.error('Combined biometric verification failed', {
        correlationId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Store biometric reference for a user
   * @param {string} userId - User ID
   * @param {string} imageUrl - Reference image URL
   * @param {Object} metadata - Reference metadata
   * @returns {Promise<Object>} Stored reference details
   */
  async storeBiometricReference(userId, imageUrl, metadata = {}) {
    const startTime = Date.now();
    const correlationId = crypto.randomUUID();

    logger.info('Storing biometric reference', {
      correlationId,
      userId,
      imageUrl,
      metadata,
    });

    try {
      if (!userId || !imageUrl) {
        throw new ValidationError('User ID and image URL are required');
      }

      // Validate image
      const imageBuffer = await this._downloadImage(imageUrl);
      const imageQuality = await this._validateImageQuality(imageBuffer);
      
      if (!imageQuality.isValid) {
        throw new BiometricError('Reference image quality is insufficient', {
          imageQuality,
        });
      }

      // Extract face features for reference
      const processedImage = await this._preprocessImage(imageBuffer);
      const faces = await this._detectFaces(processedImage);
      
      if (faces.length === 0) {
        throw new BiometricError('No face detected in reference image');
      }

      const referenceFace = this._getMostProminentFace(faces);

      // Store in database and cache
      const referenceData = {
        userId,
        imageUrl,
        faceId: referenceFace.faceId,
        boundingBox: referenceFace.boundingBox,
        confidence: referenceFace.confidence,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageQuality,
        },
        status: 'ACTIVE',
      };

      // Store in Redis cache
      const cacheKey = `biometric:reference:${userId}`;
      await this.redisClient.setex(
        cacheKey,
        this.cacheTTL * 24, // 24 hours
        JSON.stringify(referenceData)
      );

      // Store in database (you'll need to implement this)
      await this._storeReferenceInDatabase(referenceData);

      logger.info('Biometric reference stored successfully', {
        correlationId,
        userId,
        faceId: referenceFace.faceId,
      });

      return {
        success: true,
        referenceId: referenceFace.faceId,
        userId,
        status: 'ACTIVE',
        processingTime: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to store biometric reference', {
        correlationId,
        userId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  /**
   * Verify user against stored biometric reference
   * @param {string} userId - User ID
   * @param {string} imageUrl - Image to verify
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyAgainstReference(userId, imageUrl, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || crypto.randomUUID();

    logger.info('Starting biometric verification against reference', {
      correlationId,
      userId,
      imageUrl,
    });

    try {
      if (!userId || !imageUrl) {
        throw new ValidationError('User ID and image URL are required');
      }

      // Get reference from cache or database
      let referenceData = await this._getReferenceFromCache(userId);
      
      if (!referenceData) {
        referenceData = await this._getReferenceFromDatabase(userId);
        if (!referenceData) {
          throw new BiometricError('No biometric reference found for user', { userId });
        }
        // Cache it for future use
        await this._cacheReference(userId, referenceData);
      }

      // Perform face comparison
      const comparisonResult = await this.compareFaces(referenceData.imageUrl, imageUrl, {
        correlationId: `${correlationId}-reference`,
        ...options,
      });

      // Check if liveness is required
      let livenessResult = null;
      if (options.requireLiveness && options.videoUrl) {
        livenessResult = await this.detectLiveness(options.videoUrl, {
          correlationId: `${correlationId}-reference-liveness`,
          ...options,
        });
      }

      const isMatch = comparisonResult.isMatch && comparisonResult.confidenceScore >= 70;
      const isLivenessPassed = livenessResult ? livenessResult.isLive : true;

      const result = {
        success: true,
        isVerified: isMatch && isLivenessPassed,
        isMatch,
        isLivenessPassed,
        confidenceScore: comparisonResult.confidenceScore,
        livenessScore: livenessResult?.confidenceScore || null,
        referenceId: referenceData.faceId,
        comparison: comparisonResult,
        liveness: livenessResult,
        processingTime: Date.now() - startTime,
        correlationId,
      };

      logger.info('Biometric verification against reference completed', {
        correlationId,
        userId,
        isVerified: result.isVerified,
        confidenceScore: result.confidenceScore,
      });

      return result;
    } catch (error) {
      logger.error('Biometric verification against reference failed', {
        correlationId,
        userId,
        error: error.message,
        stack: error.stack,
      });

      throw this._handleError(error);
    }
  }

  // ============ Private Helper Methods ============

  /**
   * Generate cache key for face comparison
   * @private
   */
  _generateCacheKey(sourceImageUrl, targetImageUrl) {
    const hash = crypto.createHash('sha256');
    hash.update(`${sourceImageUrl}:${targetImageUrl}`);
    return `face:compare:${hash.digest('hex')}`;
  }

  /**
   * Get cached comparison result
   * @private
   */
  async _getCachedResult(cacheKey) {
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get cached result:', error);
      return null;
    }
  }

  /**
   * Cache comparison result
   * @private
   */
  async _cacheResult(cacheKey, result) {
    try {
      await this.redisClient.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    } catch (error) {
      logger.warn('Failed to cache result:', error);
    }
  }

  /**
   * Download image from URL
   * @private
   */
  async _downloadImage(imageUrl) {
    const MAX_RETRIES = 3;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'arraybuffer',
          timeout: 30000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Motsamai-Biometric-Service/1.0',
          },
        });

        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return Buffer.from(response.data);
      } catch (error) {
        lastError = error;
        logger.warn(`Image download attempt ${attempt} failed:`, {
          imageUrl,
          error: error.message,
          attempt,
        });

        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(`Failed to download image after ${MAX_RETRIES} attempts: ${lastError.message}`);
  }

  /**
   * Validate image quality
   * @private
   */
  async _validateImageQuality(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      
      // Check minimum dimensions
      const minWidth = 200;
      const minHeight = 200;
      const maxSizeMB = 10;

      const isValid = 
        metadata.width >= minWidth &&
        metadata.height >= minHeight &&
        imageBuffer.length <= maxSizeMB * 1024 * 1024;

      return {
        isValid,
        width: metadata.width,
        height: metadata.height,
        sizeBytes: imageBuffer.length,
        format: metadata.format,
        channels: metadata.channels,
        reasons: isValid ? [] : [
          !(metadata.width >= minWidth) && `Image width ${metadata.width}px is below minimum ${minWidth}px`,
          !(metadata.height >= minHeight) && `Image height ${metadata.height}px is below minimum ${minHeight}px`,
          !(imageBuffer.length <= maxSizeMB * 1024 * 1024) && `Image size ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum ${maxSizeMB}MB`,
        ].filter(Boolean),
      };
    } catch (error) {
      logger.error('Image quality validation failed:', error);
      return {
        isValid: false,
        error: error.message,
        reasons: ['Failed to validate image quality'],
      };
    }
  }

  /**
   * Preprocess image for face detection
   * @private
   */
  async _preprocessImage(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 85,
          progressive: true,
        })
        .toBuffer();
    } catch (error) {
      logger.error('Image preprocessing failed:', error);
      throw new BiometricError('Failed to preprocess image', { originalError: error.message });
    }
  }

  /**
   * Detect faces in image using AWS Rekognition
   * @private
   */
  async _detectFaces(imageBuffer) {
    try {
      const params = {
        Image: {
          Bytes: imageBuffer,
        },
        Attributes: ['ALL'],
      };

      const response = await rekognition.detectFaces(params).promise();
      
      return response.FaceDetails.map(face => ({
        faceId: crypto.randomUUID(),
        confidence: face.Confidence,
        boundingBox: face.BoundingBox,
        landmarks: face.Landmarks || [],
        pose: face.Pose || {},
        quality: face.Quality || {},
        emotions: face.Emotions || [],
        ageRange: face.AgeRange || {},
        gender: face.Gender || {},
        smile: face.Smile || {},
        sunglasses: face.Sunglasses || {},
        beard: face.Beard || {},
      }));
    } catch (error) {
      logger.error('Face detection failed:', error);
      throw new BiometricError('Failed to detect faces', { originalError: error.message });
    }
  }

  /**
   * Get most prominent face from detected faces
   * @private
   */
  _getMostProminentFace(faces) {
    if (faces.length === 0) {
      throw new BiometricError('No faces available');
    }

    // Sort by confidence descending and take the highest
    return faces.sort((a, b) => b.confidence - a.confidence)[0];
  }

  /**
   * Compare faces using AWS Rekognition
   * @private
   */
  async _compareFacesWithRekognition(sourceFace, targetFace, options = {}) {
    try {
      // Note: AWS Rekognition CompareFaces requires images, not face details.
      // This is a simplified implementation. In production, you'd compare face vectors.
      // For this example, we'll use a simulated comparison based on confidence scores.
      
      const baseConfidence = Math.min(sourceFace.confidence, targetFace.confidence);
      const similarityScore = this._calculateFaceSimilarity(sourceFace, targetFace);
      const finalScore = Math.min(baseConfidence * 0.7 + similarityScore * 0.3, 100);

      return {
        Confidence: finalScore,
        SourceFace: sourceFace,
        TargetFace: targetFace,
        Similarity: similarityScore,
        FaceMatches: [{
          Similarity: finalScore,
          Face: targetFace,
        }],
        UnmatchedFaces: [],
      };
    } catch (error) {
      logger.error('AWS Rekognition face comparison failed:', error);
      throw new BiometricError('Face comparison service failed', { originalError: error.message });
    }
  }

  /**
   * Calculate face similarity based on landmarks and features
   * @private
   */
  _calculateFaceSimilarity(sourceFace, targetFace) {
    // This is a simplified similarity calculation
    // In production, you'd use actual face feature vectors
    
    let score = 70; // Base score
    
    // Adjust based on landmarks similarity
    if (sourceFace.landmarks && targetFace.landmarks) {
      const landmarkSimilarity = this._calculateLandmarkSimilarity(
        sourceFace.landmarks,
        targetFace.landmarks
      );
      score += landmarkSimilarity * 0.3;
    }

    // Adjust based on pose
    if (sourceFace.pose && targetFace.pose) {
      const poseSimilarity = this._calculatePoseSimilarity(
        sourceFace.pose,
        targetFace.pose
      );
      score += poseSimilarity * 0.1;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate landmark similarity
   * @private
   */
  _calculateLandmarkSimilarity(sourceLandmarks, targetLandmarks) {
    // Simplified landmark similarity calculation
    // In production, you'd use more sophisticated algorithms
    
    const commonLandmarks = ['eyeLeft', 'eyeRight', 'nose', 'mouthLeft', 'mouthRight'];
    let totalScore = 0;
    let count = 0;

    for (const landmarkType of commonLandmarks) {
      const sourceLandmark = sourceLandmarks.find(l => l.Type === landmarkType);
      const targetLandmark = targetLandmarks.find(l => l.Type === landmarkType);
      
      if (sourceLandmark && targetLandmark) {
        const distance = Math.sqrt(
          Math.pow(sourceLandmark.X - targetLandmark.X, 2) +
          Math.pow(sourceLandmark.Y - targetLandmark.Y, 2)
        );
        totalScore += Math.max(0, 1 - distance);
        count++;
      }
    }

    return count > 0 ? (totalScore / count) * 100 : 0;
  }

  /**
   * Calculate pose similarity
   * @private
   */
  _calculatePoseSimilarity(sourcePose, targetPose) {
    const rollDiff = Math.abs(sourcePose.Roll - targetPose.Roll);
    const yawDiff = Math.abs(sourcePose.Yaw - targetPose.Yaw);
    const pitchDiff = Math.abs(sourcePose.Pitch - targetPose.Pitch);
    
    const totalDiff = (rollDiff + yawDiff + pitchDiff) / 3;
    return Math.max(0, 100 - (totalDiff * 2));
  }

  /**
   * Process video for liveness detection
   * @private
   */
  async _processVideoLiveness(videoUrl, options = {}) {
    // In production, this would call a liveness detection service
    // For now, we'll simulate the process
    
    const videoBuffer = await this._downloadImage(videoUrl);
    const frames = await this._extractFrames(videoBuffer);
    
    let livenessScore = 0;
    let spoofScore = 0;
    let confidenceScore = 0;

    // Analyze frames for liveness
    for (const frame of frames) {
      try {
        const faces = await this._detectFaces(frame);
        if (faces.length > 0) {
          // Check for liveness indicators
          const face = faces[0];
          const hasEyes = face.landmarks.some(l => 
            l.Type === 'eyeLeft' || l.Type === 'eyeRight'
          );
          const hasNose = face.landmarks.some(l => l.Type === 'nose');
          const hasMouth = face.landmarks.some(l => 
            l.Type === 'mouthLeft' || l.Type === 'mouthRight'
          );
          
          if (hasEyes && hasNose && hasMouth) {
            livenessScore += 1;
          }
          
          // Check for spoof indicators
          if (face.quality && face.quality.sharpness < 0.2) {
            spoofScore += 1;
          }
        }
      } catch (error) {
        logger.warn('Frame analysis failed in liveness detection:', error);
      }
    }

    const totalFrames = frames.length || 1;
    livenessScore = (livenessScore / totalFrames) * 100;
    spoofScore = (spoofScore / totalFrames) * 100;
    confidenceScore = livenessScore * 0.7 + (100 - spoofScore) * 0.3;

    return {
      confidenceScore,
      livenessScore,
      spoofScore,
      method: 'video_analysis',
      metadata: {
        framesAnalyzed: frames.length,
        totalFrames: frames.length,
      },
    };
  }

  /**
   * Process images for liveness detection
   * @private
   */
  async _processImageLiveness(imageUrl, options = {}) {
    // Similar to video processing but for multiple images
    const imageBuffer = await this._downloadImage(imageUrl);
    const faces = await this._detectFaces(imageBuffer);
    
    let livenessScore = 0;
    let spoofScore = 0;

    if (faces.length > 0) {
      const face = faces[0];
      const hasEyes = face.landmarks.some(l => 
        l.Type === 'eyeLeft' || l.Type === 'eyeRight'
      );
      const hasNose = face.landmarks.some(l => l.Type === 'nose');
      const hasMouth = face.landmarks.some(l => 
        l.Type === 'mouthLeft' || l.Type === 'mouthRight'
      );
      
      if (hasEyes && hasNose && hasMouth) {
        livenessScore = 80;
      }
      
      if (face.quality && face.quality.sharpness < 0.2) {
        spoofScore = 40;
      }
    }

    const confidenceScore = livenessScore * 0.7 + (100 - spoofScore) * 0.3;

    return {
      confidenceScore,
      livenessScore,
      spoofScore,
      method: 'image_analysis',
      metadata: {
        facesDetected: faces.length,
      },
    };
  }

  /**
   * Extract frames from video
   * @private
   */
  async _extractFrames(videoBuffer) {
    // In production, this would use FFmpeg or similar
    // For now, return the video as a single frame
    return [videoBuffer];
  }

  /**
   * Check if URL is a video
   * @private
   */
  _isVideoUrl(url) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.webm', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  /**
   * Get reference from cache
   * @private
   */
  async _getReferenceFromCache(userId) {
    try {
      const cacheKey = `biometric:reference:${userId}`;
      const cached = await this.redisClient.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get reference from cache:', error);
      return null;
    }
  }

  /**
   * Cache reference
   * @private
   */
  async _cacheReference(userId, referenceData) {
    try {
      const cacheKey = `biometric:reference:${userId}`;
      await this.redisClient.setex(
        cacheKey,
        this.cacheTTL * 24,
        JSON.stringify(referenceData)
      );
    } catch (error) {
      logger.warn('Failed to cache reference:', error);
    }
  }

  /**
   * Get reference from database
   * @private
   */
  async _getReferenceFromDatabase(userId) {
    // Implement database query
    // For now, return null
    return null;
  }

  /**
   * Store reference in database
   * @private
   */
  async _storeReferenceInDatabase(referenceData) {
    // Implement database insert
    // For now, just log
    logger.info('Reference data would be stored in database:', referenceData);
  }

  /**
   * Handle errors
   * @private
   */
  _handleError(error) {
    if (error instanceof ValidationError ||
        error instanceof BiometricError ||
        error instanceof ServiceUnavailableError) {
      return error;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return new ServiceUnavailableError('Biometric service is currently unavailable');
    }

    return new BiometricError(`Biometric operation failed: ${error.message}`);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      logger.info('Biometric service cleaned up successfully');
    } catch (error) {
      logger.error('Error during biometric service cleanup:', error);
    }
  }
}

// Export singleton instance
module.exports = new BiometricService();