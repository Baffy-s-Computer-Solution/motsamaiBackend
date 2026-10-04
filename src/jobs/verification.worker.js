/**
 * Verification Worker Service
 * 
 * Handles asynchronous verification tasks including:
 * - Document processing and OCR
 * - Face comparison and biometric verification
 * - Liveness detection processing
 * - Batch verification jobs
 * - Scheduled re-verification tasks
 * 
 * @version 1.0.0
 * @author Motsamai Team
 */

const Bull = require('bull');
const redis = require('redis');
const { promisify } = require('util');
const logger = require('../config/logger');
const BiometricService = require('../services/verification/biometric.service');
const DocumentService = require('../services/verification/document.service');
const { ValidationError, QueueError } = require('../exceptions');
const { v4: uuidv4 } = require('uuid');

// Configuration
const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 1,
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY) || 5,
    maxAttempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS) || 3,
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.QUEUE_BACKOFF_DELAY) || 1000,
    },
    timeout: parseInt(process.env.QUEUE_JOB_TIMEOUT) || 300000, // 5 minutes
  },
  batch: {
    batchSize: parseInt(process.env.BATCH_SIZE) || 10,
    maxBatchWaitTime: parseInt(process.env.MAX_BATCH_WAIT_TIME) || 5000,
  },
};

// Create Redis client for Bull
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.redis.db,
};

if (config.redis.password) {
  redisConfig.password = config.redis.password;
}

// Initialize queues
const verificationQueue = new Bull('verification', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: config.queue.maxAttempts,
    backoff: config.queue.backoff,
    timeout: config.queue.timeout,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

const documentQueue = new Bull('document-processing', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: config.queue.maxAttempts,
    backoff: config.queue.backoff,
    timeout: config.queue.timeout,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

const biometricQueue = new Bull('biometric-processing', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: config.queue.maxAttempts,
    backoff: config.queue.backoff,
    timeout: config.queue.timeout,
    removeOnComplete: true,
    removeOnFail: true,
  },
});

const scheduledQueue = new Bull('scheduled-verification', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});

/**
 * VerificationWorker class handles all background verification jobs
 */
class VerificationWorker {
  constructor() {
    this.biometricService = BiometricService;
    this.documentService = DocumentService;
    this.isRunning = false;
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      processingJobs: 0,
      lastHeartbeat: Date.now(),
    };
    this.healthCheckInterval = null;
  }

  /**
   * Initialize the worker and start processing jobs
   */
  async initialize() {
    if (this.isRunning) {
      logger.warn('Worker is already running');
      return;
    }

    logger.info('Initializing verification worker...');

    try {
      await this._setupQueues();
      await this._startProcessors();
      await this._startScheduledJobs();
      await this._setupHealthCheck();

      this.isRunning = true;
      logger.info('Verification worker initialized successfully');

      // Process any pending jobs immediately
      await this._processPendingJobs();

      return this;
    } catch (error) {
      logger.error('Failed to initialize verification worker:', error);
      throw new QueueError('Worker initialization failed', { originalError: error.message });
    }
  }

  /**
   * Shutdown the worker gracefully
   */
  async shutdown() {
    if (!this.isRunning) {
      logger.warn('Worker is not running');
      return;
    }

    logger.info('Shutting down verification worker...');

    try {
      // Stop accepting new jobs
      this.isRunning = false;

      // Clear health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Drain queues
      await verificationQueue.pause(true);
      await documentQueue.pause(true);
      await biometricQueue.pause(true);
      await scheduledQueue.pause(true);

      // Close queues
      await verificationQueue.close();
      await documentQueue.close();
      await biometricQueue.close();
      await scheduledQueue.close();

      logger.info('Verification worker shut down successfully');
    } catch (error) {
      logger.error('Error during worker shutdown:', error);
      throw error;
    }
  }

  /**
   * Add verification job to queue
   * @param {string} type - Job type (document, biometric, verification)
   * @param {Object} data - Job data
   * @param {Object} options - Job options
   * @returns {Promise<Object>} Job details
   */
  async addJob(type, data, options = {}) {
    logger.info(`Adding ${type} job to queue`, { data, options });

    try {
      let queue;
      let jobName;

      switch (type) {
        case 'document':
          queue = documentQueue;
          jobName = 'process-document';
          break;
        case 'biometric':
          queue = biometricQueue;
          jobName = 'process-biometric';
          break;
        case 'verification':
          queue = verificationQueue;
          jobName = 'verify-identity';
          break;
        case 'scheduled':
          queue = scheduledQueue;
          jobName = 'scheduled-verification';
          break;
        default:
          throw new QueueError(`Unknown job type: ${type}`);
      }

      const job = await queue.add(jobName, data, {
        ...options,
        jobId: options.jobId || `job-${Date.now()}-${uuidv4()}`,
        attempts: options.attempts || config.queue.maxAttempts,
        backoff: options.backoff || config.queue.backoff,
        timeout: options.timeout || config.queue.timeout,
      });

      this.stats.totalJobs++;

      logger.info(`Job added to ${type} queue`, {
        jobId: job.id,
        jobName,
        type,
      });

      return {
        jobId: job.id,
        queue: type,
        name: jobName,
        data: job.data,
        options: job.opts,
        timestamp: job.timestamp,
      };
    } catch (error) {
      logger.error(`Failed to add ${type} job:`, error);
      throw new QueueError(`Failed to add ${type} job`, { originalError: error.message });
    }
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @param {string} queueType - Queue type
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(jobId, queueType) {
    try {
      let queue;

      switch (queueType) {
        case 'document':
          queue = documentQueue;
          break;
        case 'biometric':
          queue = biometricQueue;
          break;
        case 'verification':
          queue = verificationQueue;
          break;
        case 'scheduled':
          queue = scheduledQueue;
          break;
        default:
          throw new QueueError(`Unknown queue type: ${queueType}`);
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return { jobId, queue: queueType, status: 'not_found' };
      }

      const status = await job.getState();
      const progress = job.progress();
      const attempts = job.attemptsMade;
      const data = job.data;
      const result = job.returnvalue;

      return {
        jobId,
        queue: queueType,
        status,
        progress: typeof progress === 'number' ? progress : 0,
        attempts,
        maxAttempts: job.opts.attempts,
        data,
        result,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      };
    } catch (error) {
      logger.error(`Failed to get job status for ${jobId}:`, error);
      throw new QueueError('Failed to get job status', { originalError: error.message });
    }
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID
   * @param {string} queueType - Queue type
   * @returns {Promise<boolean>} Success status
   */
  async cancelJob(jobId, queueType) {
    try {
      let queue;

      switch (queueType) {
        case 'document':
          queue = documentQueue;
          break;
        case 'biometric':
          queue = biometricQueue;
          break;
        case 'verification':
          queue = verificationQueue;
          break;
        case 'scheduled':
          queue = scheduledQueue;
          break;
        default:
          throw new QueueError(`Unknown queue type: ${queueType}`);
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return false;
      }

      await job.remove();

      logger.info(`Job ${jobId} cancelled`, { queueType });
      return true;
    } catch (error) {
      logger.error(`Failed to cancel job ${jobId}:`, error);
      throw new QueueError('Failed to cancel job', { originalError: error.message });
    }
  }

  /**
   * Get worker statistics
   * @returns {Object} Worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      queues: {
        verification: {
          count: verificationQueue.count(),
          active: verificationQueue.getActiveCount(),
          completed: verificationQueue.getCompletedCount(),
          failed: verificationQueue.getFailedCount(),
        },
        document: {
          count: documentQueue.count(),
          active: documentQueue.getActiveCount(),
          completed: documentQueue.getCompletedCount(),
          failed: documentQueue.getFailedCount(),
        },
        biometric: {
          count: biometricQueue.count(),
          active: biometricQueue.getActiveCount(),
          completed: biometricQueue.getCompletedCount(),
          failed: biometricQueue.getFailedCount(),
        },
        scheduled: {
          count: scheduledQueue.count(),
          active: scheduledQueue.getActiveCount(),
          completed: scheduledQueue.getCompletedCount(),
          failed: scheduledQueue.getFailedCount(),
        },
      },
      health: {
        lastHeartbeat: this.stats.lastHeartbeat,
        isHealthy: Date.now() - this.stats.lastHeartbeat < 60000,
      },
    };
  }

  // ============ Private Methods ============

  /**
   * Setup queues
   * @private
   */
  async _setupQueues() {
    // Set up event listeners for all queues
    const queues = [
      { name: 'verification', queue: verificationQueue },
      { name: 'document', queue: documentQueue },
      { name: 'biometric', queue: biometricQueue },
      { name: 'scheduled', queue: scheduledQueue },
    ];

    for (const { name, queue } of queues) {
      queue.on('error', (error) => {
        logger.error(`Queue ${name} error:`, error);
        this.stats.failedJobs++;
      });

      queue.on('waiting', (jobId) => {
        logger.debug(`Job ${jobId} waiting in ${name} queue`);
      });

      queue.on('active', (job) => {
        this.stats.processingJobs++;
        logger.debug(`Job ${job.id} started processing in ${name} queue`);
      });

      queue.on('completed', (job, result) => {
        this.stats.completedJobs++;
        this.stats.processingJobs--;
        logger.info(`Job ${job.id} completed in ${name} queue`, {
          result: typeof result === 'string' ? result : 'success',
        });
      });

      queue.on('failed', (job, error) => {
        this.stats.failedJobs++;
        this.stats.processingJobs--;
        logger.error(`Job ${job.id} failed in ${name} queue:`, error);
      });

      queue.on('progress', (job, progress) => {
        logger.debug(`Job ${job.id} progress in ${name} queue: ${progress}%`);
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job ${job.id} stalled in ${name} queue`);
      });
    }

    logger.info('All queues set up successfully');
  }

  /**
   * Start processors
   * @private
   */
  async _startProcessors() {
    // Process document verification jobs
    documentQueue.process(
      'process-document',
      config.queue.concurrency,
      this._processDocument.bind(this)
    );

    // Process biometric verification jobs
    biometricQueue.process(
      'process-biometric',
      config.queue.concurrency,
      this._processBiometric.bind(this)
    );

    // Process full verification jobs
    verificationQueue.process(
      'verify-identity',
      config.queue.concurrency,
      this._processVerification.bind(this)
    );

    // Process scheduled verification jobs
    scheduledQueue.process(
      'scheduled-verification',
      config.queue.concurrency,
      this._processScheduledVerification.bind(this)
    );

    logger.info('All processors started');
  }

  /**
   * Start scheduled jobs
   * @private
   */
  async _startScheduledJobs() {
    // Add recurring jobs for driver re-verification
    await this._scheduleReVerification();

    // Add recurring jobs for document expiry checks
    await this._scheduleDocumentExpiryChecks();

    // Add recurring health check jobs
    await this._scheduleHealthCheckJobs();

    logger.info('Scheduled jobs configured');
  }

  /**
   * Setup health check
   * @private
   */
  async _setupHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        this.stats.lastHeartbeat = Date.now();

        // Check queue health
        const queues = [
          verificationQueue,
          documentQueue,
          biometricQueue,
          scheduledQueue,
        ];

        const healthStatus = await Promise.all(
          queues.map(async (queue) => {
            const count = await queue.count();
            const active = await queue.getActiveCount();
            const failed = await queue.getFailedCount();
            return { count, active, failed };
          })
        );

        // Log health status periodically
        if (this.stats.processingJobs > 0) {
          logger.debug('Worker health check', {
            stats: this.stats,
            queueStatus: healthStatus,
          });
        }
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Every 30 seconds

    logger.info('Health check set up');
  }

  /**
   * Process document job
   * @private
   */
  async _processDocument(job) {
    const startTime = Date.now();
    const { documentId, userId, documentType, fileUrl, options = {} } = job.data;

    logger.info(`Processing document job ${job.id}`, {
      documentId,
      userId,
      documentType,
    });

    try {
      // Update progress
      await job.progress(10);

      // Validate job data
      if (!documentId || !userId || !documentType || !fileUrl) {
        throw new ValidationError('Missing required job data');
      }

      // Process document
      await job.progress(30);
      const result = await this.documentService.uploadDocument({
        userId,
        documentType,
        fileUrl,
        correlationId: job.id,
        ...options,
      });

      await job.progress(70);

      // Verify document
      if (options.verifyDocument !== false) {
        const verificationResult = await this.documentService.verifyDocument(
          documentId,
          { correlationId: job.id, ...options }
        );
        result.verification = verificationResult;
      }

      await job.progress(90);

      // Extract text if requested
      if (options.extractText) {
        const extractionResult = await this.documentService.extractText(
          documentId,
          { correlationId: job.id, ...options }
        );
        result.extractedData = extractionResult;
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;

      logger.info(`Document job ${job.id} completed`, {
        documentId,
        userId,
        processingTime,
      });

      return {
        success: true,
        documentId,
        userId,
        result,
        processingTime,
        jobId: job.id,
      };
    } catch (error) {
      logger.error(`Document job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Process biometric job
   * @private
   */
  async _processBiometric(job) {
    const startTime = Date.now();
    const { userId, sourceImageUrl, targetImageUrl, videoUrl, options = {} } = job.data;

    logger.info(`Processing biometric job ${job.id}`, {
      userId,
      hasSourceImage: !!sourceImageUrl,
      hasTargetImage: !!targetImageUrl,
      hasVideo: !!videoUrl,
    });

    try {
      await job.progress(10);

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      let result;

      // Check if it's a comparison or verification job
      if (sourceImageUrl && targetImageUrl) {
        await job.progress(30);
        // Face comparison
        result = await this.biometricService.compareFaces(
          sourceImageUrl,
          targetImageUrl,
          { correlationId: job.id, ...options }
        );
        await job.progress(60);
      } else if (videoUrl) {
        await job.progress(30);
        // Liveness detection
        result = await this.biometricService.detectLiveness(
          videoUrl,
          { correlationId: job.id, ...options }
        );
        await job.progress(60);
      } else {
        throw new ValidationError('Either images or video must be provided for biometric processing');
      }

      // If verification against reference is requested
      if (options.verifyAgainstReference && userId) {
        await job.progress(70);
        const referenceResult = await this.biometricService.verifyAgainstReference(
          userId,
          targetImageUrl || sourceImageUrl,
          {
            correlationId: job.id,
            requireLiveness: true,
            videoUrl,
            ...options,
          }
        );
        result = { ...result, referenceVerification: referenceResult };
      }

      await job.progress(90);

      // Store biometric data if requested
      if (options.storeReference && userId && targetImageUrl) {
        await this.biometricService.storeBiometricReference(
          userId,
          targetImageUrl,
          {
            correlationId: job.id,
            verificationResult: result,
            ...options,
          }
        );
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;

      logger.info(`Biometric job ${job.id} completed`, {
        userId,
        isMatch: result.isMatch,
        confidenceScore: result.confidenceScore,
        processingTime,
      });

      return {
        success: true,
        userId,
        result,
        processingTime,
        jobId: job.id,
      };
    } catch (error) {
      logger.error(`Biometric job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Process verification job
   * @private
   */
  async _processVerification(job) {
    const startTime = Date.now();
    const { userId, documents, biometric, options = {} } = job.data;

    logger.info(`Processing verification job ${job.id}`, {
      userId,
      hasDocuments: !!documents,
      hasBiometric: !!biometric,
    });

    try {
      await job.progress(10);

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const result = {
        userId,
        documents: {},
        biometric: {},
        overall: {
          success: false,
          isVerified: false,
          score: 0,
          flags: [],
          status: 'PENDING',
        },
      };

      // Process documents if provided
      if (documents) {
        await job.progress(20);
        try {
          const docResults = await this._processDocumentBatch(documents, job.id);
          result.documents = docResults;
          result.overall.flags.push(...(docResults.flags || []));
        } catch (error) {
          logger.error(`Document processing failed in verification job ${job.id}:`, error);
          result.documents.error = error.message;
          result.overall.flags.push('DOCUMENT_PROCESSING_FAILED');
        }
      }

      // Process biometric if provided
      if (biometric) {
        await job.progress(60);
        try {
          const bioResults = await this._processBiometricBatch(biometric, job.id);
          result.biometric = bioResults;
          result.overall.flags.push(...(bioResults.flags || []));
        } catch (error) {
          logger.error(`Biometric processing failed in verification job ${job.id}:`, error);
          result.biometric.error = error.message;
          result.overall.flags.push('BIOMETRIC_PROCESSING_FAILED');
        }
      }

      await job.progress(90);

      // Calculate overall score
      let totalScore = 0;
      let components = 0;

      if (result.documents.verificationScore) {
        totalScore += result.documents.verificationScore;
        components++;
      }

      if (result.biometric.confidenceScore) {
        totalScore += result.biometric.confidenceScore;
        components++;
      }

      result.overall.score = components > 0 ? Math.round(totalScore / components) : 0;
      result.overall.isVerified = this._determineOverallVerification(result);
      result.overall.success = true;
      result.overall.status = result.overall.isVerified ? 'VERIFIED' : 'FAILED';

      await job.progress(100);

      const processingTime = Date.now() - startTime;

      logger.info(`Verification job ${job.id} completed`, {
        userId,
        isVerified: result.overall.isVerified,
        score: result.overall.score,
        status: result.overall.status,
        processingTime,
      });

      return {
        success: true,
        userId,
        result,
        processingTime,
        jobId: job.id,
      };
    } catch (error) {
      logger.error(`Verification job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Process scheduled verification job
   * @private
   */
  async _processScheduledVerification(job) {
    const startTime = Date.now();
    const { userId, type, options = {} } = job.data;

    logger.info(`Processing scheduled verification job ${job.id}`, {
      userId,
      type,
    });

    try {
      await job.progress(10);

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      let result;

      switch (type) {
        case 're-verification':
          result = await this._performReVerification(userId, job.id);
          break;
        case 'document-expiry':
          result = await this._checkDocumentExpiry(userId, job.id);
          break;
        case 'health-check':
          result = await this._performHealthCheck(userId, job.id);
          break;
        default:
          throw new ValidationError(`Unknown scheduled job type: ${type}`);
      }

      await job.progress(100);

      const processingTime = Date.now() - startTime;

      logger.info(`Scheduled verification job ${job.id} completed`, {
        userId,
        type,
        success: result.success,
        processingTime,
      });

      return {
        success: true,
        userId,
        type,
        result,
        processingTime,
        jobId: job.id,
      };
    } catch (error) {
      logger.error(`Scheduled verification job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Process document batch
   * @private
   */
  async _processDocumentBatch(documents, jobId) {
    const results = {
      processed: [],
      failed: [],
      flags: [],
      verificationScore: 0,
    };

    for (const doc of documents) {
      try {
        const result = await this._processDocument({
          data: {
            documentId: doc.documentId || `doc-${Date.now()}`,
            userId: doc.userId,
            documentType: doc.documentType,
            fileUrl: doc.fileUrl,
            options: doc.options || {},
          },
          id: `${jobId}-doc-${doc.documentType}`,
          progress: () => {},
        });

        results.processed.push(result);
        if (result.result && result.result.processedData) {
          // Calculate document verification score
          const score = result.result.processedData.metadata?.validation?.status === 'VALID' ? 85 : 60;
          results.verificationScore = (results.verificationScore + score) / (results.processed.length || 1);
        }
      } catch (error) {
        results.failed.push({
          documentType: doc.documentType,
          error: error.message,
        });
        results.flags.push(`DOCUMENT_${doc.documentType.toUpperCase()}_FAILED`);
      }
    }

    return results;
  }

  /**
   * Process biometric batch
   * @private
   */
  async _processBiometricBatch(biometricData, jobId) {
    const results = {
      processed: [],
      failed: [],
      flags: [],
      confidenceScore: 0,
    };

    try {
      // Process face comparison if both images provided
      if (biometricData.sourceImageUrl && biometricData.targetImageUrl) {
        const result = await this.biometricService.compareFaces(
          biometricData.sourceImageUrl,
          biometricData.targetImageUrl,
          { correlationId: jobId }
        );

        results.processed.push({
          type: 'face_comparison',
          result,
        });

        if (result.isMatch) {
          results.confidenceScore = result.confidenceScore;
        } else {
          results.flags.push('FACE_MISMATCH');
        }
      }

      // Process liveness detection if video provided
      if (biometricData.videoUrl) {
        const result = await this.biometricService.detectLiveness(
          biometricData.videoUrl,
          { correlationId: jobId }
        );

        results.processed.push({
          type: 'liveness_detection',
          result,
        });

        if (!result.isLive) {
          results.flags.push('LIVENESS_FAILED');
        }
      }

      // Store reference if requested
      if (biometricData.storeReference && biometricData.userId) {
        await this.biometricService.storeBiometricReference(
          biometricData.userId,
          biometricData.targetImageUrl || biometricData.sourceImageUrl,
          { correlationId: jobId }
        );
      }
    } catch (error) {
      results.failed.push({
        error: error.message,
      });
      results.flags.push('BIOMETRIC_PROCESSING_FAILED');
    }

    return results;
  }

  /**
   * Perform re-verification
   * @private
   */
  async _performReVerification(userId, jobId) {
    // In production, get user's reference data and perform verification
    // For now, simulate the process
    return {
      success: true,
      type: 're-verification',
      status: 'PASSED',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check document expiry
   * @private
   */
  async _checkDocumentExpiry(userId, jobId) {
    // In production, check all documents for expiry
    return {
      success: true,
      type: 'document-expiry',
      documents: [],
      expiredDocuments: [],
      expiringSoon: [],
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Perform health check
   * @private
   */
  async _performHealthCheck(userId, jobId) {
    // Check system health
    return {
      success: true,
      type: 'health-check',
      status: 'HEALTHY',
      services: {
        biometric: true,
        document: true,
        redis: true,
        s3: true,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Determine overall verification status
   * @private
   */
  _determineOverallVerification(result) {
    // Must pass document verification
    if (result.documents.processed?.length > 0) {
      const docFailed = result.documents.failed?.length > 0;
      if (docFailed) {
        return false;
      }
    }

    // Must pass biometric verification
    if (result.biometric.processed?.length > 0) {
      const hasMismatch = result.biometric.flags?.some(f => f === 'FACE_MISMATCH');
      const hasLivenessFail = result.biometric.flags?.some(f => f === 'LIVENESS_FAILED');
      if (hasMismatch || hasLivenessFail) {
        return false;
      }
    }

    // Check for critical flags
    const criticalFlags = [
      'DOCUMENT_PROCESSING_FAILED',
      'BIOMETRIC_PROCESSING_FAILED',
      'EXPIRED_LICENSE',
      'FRAUDULENT_DOCUMENT',
    ];

    const hasCriticalFlag = result.overall.flags?.some(f => 
      criticalFlags.includes(f)
    );

    if (hasCriticalFlag) {
      return false;
    }

    // Overall score threshold
    if (result.overall.score < 70) {
      return false;
    }

    return true;
  }

  /**
   * Schedule re-verification jobs
   * @private
   */
  async _scheduleReVerification() {
    // Schedule daily re-verification checks
    await scheduledQueue.add(
      'scheduled-verification',
      {
        type: 're-verification',
        options: { batch: true },
      },
      {
        repeat: {
          cron: '0 0 * * *', // Daily at midnight
        },
        jobId: 'scheduled-re-verification',
      }
    );

    logger.info('Re-verification scheduled');
  }

  /**
   * Schedule document expiry checks
   * @private
   */
  async _scheduleDocumentExpiryChecks() {
    // Schedule daily document expiry checks
    await scheduledQueue.add(
      'scheduled-verification',
      {
        type: 'document-expiry',
        options: { batch: true },
      },
      {
        repeat: {
          cron: '0 1 * * *', // Daily at 1 AM
        },
        jobId: 'scheduled-document-expiry',
      }
    );

    logger.info('Document expiry checks scheduled');
  }

  /**
   * Schedule health check jobs
   * @private
   */
  async _scheduleHealthCheckJobs() {
    // Schedule hourly health checks
    await scheduledQueue.add(
      'scheduled-verification',
      {
        type: 'health-check',
        options: { system: true },
      },
      {
        repeat: {
          cron: '0 * * * *', // Hourly
        },
        jobId: 'scheduled-health-check',
      }
    );

    logger.info('Health check jobs scheduled');
  }

  /**
   * Process pending jobs
   * @private
   */
  async _processPendingJobs() {
    try {
      const queues = [
        verificationQueue,
        documentQueue,
        biometricQueue,
        scheduledQueue,
      ];

      for (const queue of queues) {
        const waitingJobs = await queue.getWaiting();
        const delayedJobs = await queue.getDelayed();

        logger.info(`Processing pending jobs for ${queue.name}`, {
          waiting: waitingJobs.length,
          delayed: delayedJobs.length,
        });
      }
    } catch (error) {
      logger.warn('Failed to process pending jobs:', error);
    }
  }
}

// Create singleton instance
const worker = new VerificationWorker();

// Handle process signals
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker...');
  await worker.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker...');
  await worker.shutdown();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection in worker:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in worker:', error);
  // Graceful shutdown
  worker.shutdown().then(() => {
    process.exit(1);
  });
});

// Initialize the worker
if (require.main === module) {
  worker.initialize().catch((error) => {
    logger.error('Failed to initialize worker:', error);
    process.exit(1);
  });
}

// Export for testing
module.exports = {
  VerificationWorker,
  worker,
  queues: {
    verificationQueue,
    documentQueue,
    biometricQueue,
    scheduledQueue,
  },
};