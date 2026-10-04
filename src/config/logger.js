/**
 * Production-Grade Winston Logger for Motsamai Backend
 * Features: Daily rotation, multiple transports, structured logging, performance tracking
 * @version 3.0.0
 */

const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const os = require('os');
const fs = require('fs');
const util = require('util');

// ==================== DIRECTORY SETUP ====================

const logDir = path.join(process.cwd(), 'logs');
const tempDir = path.join(process.cwd(), 'tmp');

// Ensure directories exist
[logDir, tempDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ==================== ENVIRONMENT DETECTION ====================

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isStaging = env === 'staging';
const isDevelopment = env === 'development';
const isTest = env === 'test';

// ==================== LOG LEVEL CONFIGURATION ====================

const getLogLevel = () => {
  const customLevel = process.env.LOG_LEVEL;
  if (customLevel) return customLevel.toLowerCase();

  if (isProduction) return 'info';
  if (isStaging) return 'debug';
  if (isTest) return 'error';
  return 'debug';
};

const logLevel = getLogLevel();

// ==================== CUSTOM FORMATS ====================

// Errors format with stack trace
const errorFormat = winston.format((info) => {
  if (info instanceof Error) {
    info.message = info.message;
    info.stack = info.stack;
    info.name = info.name;
  }
  return info;
});

// Metadata filtering (remove sensitive data)
const filterSensitiveData = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'];
  const redacted = '[REDACTED]';

  const redactObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result = { ...obj };

    Object.keys(result).forEach((key) => {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        result[key] = redacted;
      } else if (result[key] && typeof result[key] === 'object') {
        result[key] = redactObject(result[key]);
      }
    });

    return result;
  };

  if (info.metadata) {
    info.metadata = redactObject(info.metadata);
  }

  return info;
});

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  errorFormat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      const filtered = { ...meta };
      delete filtered.service;
      delete filtered.hostname;
      delete filtered.pid;
      delete filtered.environment;
      delete filtered.version;

      if (Object.keys(filtered).length > 0) {
        metaStr = `\n${util.inspect(filtered, { depth: 5, colors: true, compact: false })}`;
      }
    }
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

// JSON format for file logs
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['timestamp', 'level', 'message'] }),
  errorFormat(),
  filterSensitiveData(),
  winston.format.json()
);

// ==================== CUSTOM TRANSPORTS ====================

// Daily rotate file transport factory
const createRotateTransport = (filename, level, maxFiles = '14d', maxSize = '20m') => {
  return new winston.transports.DailyRotateFile({
    filename: path.join(logDir, filename),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize,
    maxFiles,
    format: jsonFormat,
    level,
    handleExceptions: true,
    handleRejections: true,
  });
};

// Console transport
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  level: logLevel,
  handleExceptions: true,
  handleRejections: true,
});

// ==================== BUILD TRANSPORTS ====================

const transports = [];

// Add file transports in all environments
transports.push(createRotateTransport('application-%DATE%.log', logLevel));
transports.push(createRotateTransport('error-%DATE%.log', 'error', '30d'));
transports.push(createRotateTransport('http-%DATE%.log', 'http', '7d'));
transports.push(createRotateTransport('performance-%DATE%.log', 'verbose', '7d'));

// Add separate security log
transports.push(createRotateTransport('security-%DATE%.log', 'warn', '90d'));

// Add request/response log
transports.push(createRotateTransport('requests-%DATE%.log', 'info', '30d'));

// Add console transport in non-production environments
if (!isProduction && !isTest) {
  transports.push(consoleTransport);
}

// ==================== CREATE LOGGER ====================

const logger = winston.createLogger({
  level: logLevel,
  format: jsonFormat,
  defaultMeta: {
    service: process.env.npm_package_name || 'motsamai-web-backend',
    hostname: os.hostname(),
    pid: process.pid,
    environment: env,
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    platform: process.platform,
  },
  transports,
  exitOnError: false,
  silent: isTest && process.env.SILENT_LOGS === 'true',
});

// ==================== STREAM FOR MORGAN ====================

logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Log API request with performance metrics
 */
logger.logRequest = (req, res, duration) => {
  const data = {
    type: 'request',
    method: req.method,
    url: req.url,
    path: req.path,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    requestId: req.requestId || req.id,
    correlationId: req.correlationId || req.headers['x-correlation-id'],
    referer: req.get('referer'),
    contentLength: req.get('content-length'),
    responseLength: res.get('content-length'),
  };

  const level = res.statusCode >= 500 ? 'error' : 
                res.statusCode >= 400 ? 'warn' : 
                'info';

  logger[level](data, `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
};

/**
 * Log database query performance
 */
logger.logQuery = (query, duration, params = null, model = null) => {
  const data = {
    type: 'database_query',
    query: query.substring(0, 1000),
    duration: `${duration}ms`,
    model,
    params: params ? JSON.stringify(params).substring(0, 500) : null,
  };

  const level = duration > 5000 ? 'warn' : duration > 2000 ? 'info' : 'debug';
  logger[level](data, `Query executed in ${duration}ms`);
};

/**
 * Log API call to external service
 */
logger.logExternalCall = (service, endpoint, duration, success, error = null, response = null) => {
  const data = {
    type: 'external_api',
    service,
    endpoint,
    duration: `${duration}ms`,
    success,
    responseStatus: response?.status,
    responseSize: response?.headers?.['content-length'],
    error: error ? {
      message: error.message,
      code: error.code,
      status: error.status,
    } : null,
  };

  const level = success ? 'info' : 'error';
  logger[level](data, `${service} ${endpoint} - ${success ? 'Success' : 'Failed'} (${duration}ms)`);
};

/**
 * Log business event
 */
logger.logEvent = (eventName, data, userId = null, context = {}) => {
  logger.info({
    type: 'business_event',
    event: eventName,
    userId,
    data,
    context,
  }, `Business Event: ${eventName}`);
};

/**
 * Log security event
 */
logger.logSecurity = (eventName, data, userId = null, ip = null, severity = 'info') => {
  const logData = {
    type: 'security_event',
    event: eventName,
    userId,
    ip,
    data,
    timestamp: new Date().toISOString(),
  };

  const level = severity === 'critical' ? 'error' : 'warn';
  logger[level](logData, `Security Event: ${eventName}`);
};

/**
 * Log performance metrics
 */
logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.verbose({
    type: 'performance',
    operation,
    duration: `${duration}ms`,
    ...metadata,
  }, `${operation} - ${duration}ms`);
};

/**
 * Log system event (startup, shutdown, etc.)
 */
logger.logSystem = (event, metadata = {}) => {
  logger.info({
    type: 'system_event',
    event,
    metadata,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  }, `System: ${event}`);
};

/**
 * Log validation error
 */
logger.logValidationError = (errors, context = {}) => {
  logger.warn({
    type: 'validation_error',
    errors: errors.map((err) => ({
      field: err.field || err.path || err.param,
      message: err.message || err.msg,
      value: err.value,
    })),
    context,
  }, `Validation failed: ${errors.length} errors`);
};

/**
 * Create a child logger with additional context
 */
logger.child = (context) => {
  return logger.child(context);
};

/**
 * Flush all transports
 */
logger.flush = () => {
  return new Promise((resolve) => {
    const activeTransports = transports.filter(t => typeof t.end === 'function');
    if (activeTransports.length === 0) {
      resolve();
      return;
    }

    let pending = activeTransports.length;
    const done = () => {
      pending--;
      if (pending === 0) resolve();
    };

    activeTransports.forEach((transport) => {
      transport.once('finish', done);
      transport.once('error', done);
      transport.end();
    });

    // Safety timeout
    setTimeout(resolve, 5000);
  });
};

/**
 * Create HTTP request logger middleware for Express
 */
logger.httpLogger = () => {
  return (req, res, next) => {
    const startTime = Date.now();

    // Capture response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      const duration = Date.now() - startTime;
      logger.logRequest(req, res, duration);
      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
};

/**
 * Error tracking with context
 */
logger.trackError = (error, context = {}) => {
  const errorData = {
    type: 'error',
    message: error.message,
    stack: error.stack,
    code: error.code,
    status: error.status || error.statusCode,
    ...context,
  };

  const level = error.status >= 500 || !error.status ? 'error' : 'warn';
  logger[level](errorData, `Error: ${error.message}`);
  return error;
};

// ==================== LOG STARTUP ====================

logger.logSystem('logger_initialized', {
  level: logLevel,
  environment: env,
  logDirectory: logDir,
  transports: transports.map(t => t.name || t.constructor.name),
  processId: process.pid,
});

// ==================== EXPORT ====================

module.exports = logger;
module.exports.logLevel = logLevel;
module.exports.logDir = logDir;