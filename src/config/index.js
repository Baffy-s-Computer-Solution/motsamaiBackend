/**
 * Central Configuration Module for Motsamai Backend
 * Loads and validates all environment variables with enhanced error handling
 * @version 3.0.0
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ==================== ENVIRONMENT LOADING ====================

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isStaging = NODE_ENV === 'staging';
const isDevelopment = NODE_ENV === 'development';
const isTest = NODE_ENV === 'test';

// Load environment files in priority order. The first existing file wins for
// each variable, so local overrides beat shared development defaults.
const envFiles = [
  `.env.${NODE_ENV}.local`,
  `.env.local`,
  `.env.${NODE_ENV}`,
  '.env',
];

envFiles.forEach((file) => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
});

// ==================== HELPER FUNCTIONS ====================

const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase().trim();
  return ['true', '1', 'yes', 'on', 'enabled'].includes(str);
};

const parseIntEnv = (value, defaultValue) => {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(String(value).trim(), 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const parseFloatEnv = (value, defaultValue) => {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseFloat(String(value).trim());
  return isNaN(parsed) ? defaultValue : parsed;
};

const parseArray = (value, defaultValue = [], delimiter = ',') => {
  if (!value) return defaultValue;
  if (Array.isArray(value)) return value;
  return String(value).split(delimiter).map(item => item.trim()).filter(Boolean);
};

const parseJson = (value, defaultValue = null) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
};

const generateSecret = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// ==================== VALIDATION FUNCTIONS ====================

const validateUrl = (url, name) => {
  if (!url) return null;
  try {
    new URL(url);
    return url;
  } catch {
    console.warn(`⚠️  Invalid URL for ${name}: ${url}`);
    return null;
  }
};

const validateEmail = (email) => {
  if (!email) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : null;
};

const defaultCorsOrigins = isProduction
  ? ['https://motsamai.web.app', 'https://motsamai.firebaseapp.com']
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4000'];

// ==================== CONFIGURATION BUILDER ====================

const config = {
  // ==================== APP CONFIGURATION ====================
  app: {
    env: NODE_ENV,
    isProduction,
    isStaging,
    isDevelopment,
    isTest,
    port: parseIntEnv(process.env.PORT, 4000),
    host: process.env.HOST || '0.0.0.0',
    apiVersion: process.env.API_VERSION || 'v1',
    name: process.env.APP_NAME || 'Motsamai Web Backend',
    baseUrl: process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${parseIntEnv(process.env.PORT, 4000)}`,
    frontendUrl: process.env.FRONTEND_URL || (isProduction ? 'https://motsamai.web.app' : 'http://localhost:5173'),
    trustProxy: parseBool(process.env.TRUST_PROXY, isProduction),
  },

  // ==================== CLUSTER CONFIGURATION ====================
  cluster: {
    enabled: parseBool(process.env.CLUSTER_MODE, false),
    workers: parseIntEnv(process.env.WORKERS, null), // null = auto-detect
    maxMemory: parseIntEnv(process.env.MAX_MEMORY, 512), // MB
  },

  // ==================== SERVER CONFIGURATION ====================
  server: {
    timeout: parseIntEnv(process.env.SERVER_TIMEOUT, 120000),
    keepAliveTimeout: parseIntEnv(process.env.KEEP_ALIVE_TIMEOUT, 65000),
    headersTimeout: parseIntEnv(process.env.HEADERS_TIMEOUT, 66000),
    maxHeadersCount: parseIntEnv(process.env.MAX_HEADERS_COUNT, 2000),
    bodyLimit: process.env.BODY_LIMIT || '10mb',
    parameterLimit: parseIntEnv(process.env.PARAMETER_LIMIT, 1000),
  },

  // ==================== SSL/TLS CONFIGURATION ====================
  ssl: {
    enabled: parseBool(process.env.SSL_ENABLED, false),
    keyPath: process.env.SSL_KEY_PATH,
    certPath: process.env.SSL_CERT_PATH,
    caPath: process.env.SSL_CA_PATH,
    rejectUnauthorized: parseBool(process.env.SSL_REJECT_UNAUTHORIZED, true),
  },

  // ==================== DATABASE CONFIGURATION ====================
  database: {
    dialect: process.env.DB_DIALECT || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseIntEnv(process.env.DB_PORT, 5432),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || (isProduction ? 'postgres' : 'motsamai_dev'),
    url: process.env.DATABASE_URL,

    // Connection Pool
    pool: {
      max: parseIntEnv(process.env.DB_POOL_MAX, 20),
      min: parseIntEnv(process.env.DB_POOL_MIN, 2),
      acquire: parseIntEnv(process.env.DB_POOL_ACQUIRE, 30000),
      idle: parseIntEnv(process.env.DB_POOL_IDLE, 10000),
      evict: parseIntEnv(process.env.DB_POOL_EVICT, 1000),
    },

    // SSL Configuration
    ssl: parseBool(process.env.DB_SSL, isProduction),
    sslRejectUnauthorized: parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
    sslCa: process.env.DB_SSL_CA,
    sslCert: process.env.DB_SSL_CERT,
    sslKey: process.env.DB_SSL_KEY,

    // Sync Options
    sync: parseBool(process.env.DB_SYNC, false),
    syncAlter: parseBool(process.env.DB_SYNC_ALTER, false),
    syncForce: parseBool(process.env.DB_SYNC_FORCE, false),

    // Logging
    logging: parseBool(process.env.DB_LOGGING, isDevelopment),
    logParameters: parseBool(process.env.DB_LOG_PARAMETERS, false),
    benchmark: parseBool(process.env.DB_BENCHMARK, false),

    // Timezone
    timezone: process.env.DB_TIMEZONE || '+00:00',

    // Retry Configuration
    retry: {
      max: parseIntEnv(process.env.DB_RETRY_MAX, 3),
      match: [
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
        /SequelizeDatabaseError/,
        /SequelizeTimeoutError/,
      ],
      backoffBase: parseIntEnv(process.env.DB_RETRY_BACKOFF_BASE, 1000),
      backoffExponent: parseFloatEnv(process.env.DB_RETRY_BACKOFF_EXPONENT, 1.5),
    },

    // Define Options
    define: {
      timestamps: true,
      underscored: true,
      paranoid: true,
      freezeTableName: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
    },

    // Migration Options
    migrationStorage: 'sequelize',
    migrationStorageTableName: 'SequelizeMeta',
    seederStorage: 'sequelize',
    seederStorageTableName: 'SequelizeData',
  },

  // ==================== REDIS CONFIGURATION ====================
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseIntEnv(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
    db: parseIntEnv(process.env.REDIS_DB, 0),
    tls: parseBool(process.env.REDIS_TLS, false),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'motsamai:',

    // Connection Pool
    pool: {
      max: parseIntEnv(process.env.REDIS_POOL_MAX, 10),
      min: parseIntEnv(process.env.REDIS_POOL_MIN, 2),
      idle: parseIntEnv(process.env.REDIS_POOL_IDLE, 10000),
    },

    // Cache Settings
    ttl: parseIntEnv(process.env.REDIS_TTL, 3600),
    cacheEnabled: parseBool(process.env.REDIS_CACHE_ENABLED, true),

    // Retry Strategy
    retryStrategy: (times) => {
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 100, 3000);
    },
  },

  // ==================== JWT AUTHENTICATION ====================
  jwt: {
    secret: process.env.JWT_SECRET || (isProduction ? '' : generateSecret(64)),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || (isProduction ? '' : process.env.JWT_SECRET || generateSecret(64)),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: process.env.JWT_ISSUER || 'motsamai-backend',
    audience: process.env.JWT_AUDIENCE || 'motsamai-users',
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
  },

  // ==================== BCRYPT ====================
  bcrypt: {
    saltRounds: parseIntEnv(process.env.BCRYPT_SALT_ROUNDS, 12),
    minLength: parseIntEnv(process.env.BCRYPT_MIN_LENGTH, 8),
  },

  // ==================== ADMIN BOOTSTRAP ====================
  admin: {
    email: validateEmail(process.env.ADMIN_EMAIL || process.env.DEMO_ADMIN_EMAIL) || '',
    password: process.env.ADMIN_PASSWORD || process.env.DEMO_ADMIN_PASSWORD || (isProduction ? '' : generateSecret(12)),
    name: process.env.ADMIN_NAME || 'Motsamai Admin',
    phone: process.env.ADMIN_PHONE || process.env.DEMO_ADMIN_PHONE || '+26600000000',
  },

  demoAdmin: {
    email: validateEmail(process.env.DEMO_ADMIN_EMAIL || process.env.ADMIN_EMAIL) || '',
    password: process.env.DEMO_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || (isProduction ? '' : 'Demo@123456'),
    name: process.env.DEMO_ADMIN_NAME || 'Motsamai Demo Admin',
    phone: process.env.DEMO_ADMIN_PHONE || '+26600000000',
  },

  cynthia: {
    email: validateEmail(process.env.CYNTHIA_ADMIN_EMAIL || process.env.VITE_CYNTHIA_ADMIN_EMAIL || process.env.REAL_ADMIN_EMAIL) || '',
    name: process.env.CYNTHIA_ADMIN_NAME || process.env.REAL_ADMIN_NAME || '',
    phone: process.env.CYNTHIA_ADMIN_PHONE || process.env.REAL_ADMIN_PHONE || '',
  },

  // ==================== SUPABASE ====================
  supabase: {
    url: validateUrl(process.env.SUPABASE_URL, 'SUPABASE_URL'),
    anonKey: process.env.SUPABASE_ANON_KEY,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'motsamai',
    storagePublic: parseBool(process.env.SUPABASE_STORAGE_PUBLIC, true),
    maxFileSize: parseIntEnv(process.env.SUPABASE_MAX_FILE_SIZE, 52428800), // 50MB
    allowedMimeTypes: parseArray(process.env.SUPABASE_ALLOWED_MIME_TYPES, [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/json',
      'text/plain',
    ]),
  },

  // ==================== CORS CONFIGURATION ====================
  cors: {
    origins: parseArray(process.env.CORS_ORIGINS, defaultCorsOrigins),
    credentials: parseBool(process.env.CORS_CREDENTIALS, true),
    methods: process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS,HEAD',
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS ||
      'Content-Type,Authorization,X-Request-ID,X-Correlation-ID,Accept,Origin,User-Agent',
    exposedHeaders: process.env.CORS_EXPOSED_HEADERS ||
      'X-Request-ID,X-Correlation-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset',
    maxAge: parseIntEnv(process.env.CORS_MAX_AGE, 86400),
    preflightContinue: parseBool(process.env.CORS_PREFLIGHT_CONTINUE, false),
  },

  // ==================== RATE LIMITING ====================
  rateLimit: {
    windowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
    max: parseIntEnv(process.env.RATE_LIMIT_MAX_REQUESTS, 3000),
    skipSuccessful: parseBool(process.env.RATE_LIMIT_SKIP_SUCCESSFUL, false),
    standardHeaders: parseBool(process.env.RATE_LIMIT_STANDARD_HEADERS, true),
    legacyHeaders: parseBool(process.env.RATE_LIMIT_LEGACY_HEADERS, false),

    auth: {
      windowMs: parseIntEnv(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 900000),
      max: parseIntEnv(process.env.RATE_LIMIT_AUTH_MAX, 100),
    },

    api: {
      windowMs: parseIntEnv(process.env.RATE_LIMIT_API_WINDOW_MS, 60000),
      max: parseIntEnv(process.env.RATE_LIMIT_API_MAX, 60),
    },

    admin: {
      windowMs: parseIntEnv(process.env.RATE_LIMIT_ADMIN_WINDOW_MS, 60000),
      max: parseIntEnv(process.env.RATE_LIMIT_ADMIN_MAX, 1000),
    },
  },

  // ==================== FILE UPLOADS ====================
  upload: {
    maxSize: parseIntEnv(process.env.MAX_UPLOAD_SIZE, 5242880), // 5MB
    maxFiles: parseIntEnv(process.env.MAX_UPLOAD_FILES, 10),
    allowedTypes: parseArray(process.env.ALLOWED_FILE_TYPES, [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    directory: process.env.UPLOAD_DIR || 'uploads',
    tempDirectory: process.env.UPLOAD_TEMP_DIR || 'tmp',
  },

  // ==================== LOGGING ====================
  logging: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    filePath: process.env.LOG_FILE_PATH || 'logs/app.log',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    jsonFormat: parseBool(process.env.LOG_JSON_FORMAT, isProduction),
    colorize: parseBool(process.env.LOG_COLORIZE, !isProduction),
    timestampFormat: process.env.LOG_TIMESTAMP_FORMAT || 'YYYY-MM-DD HH:mm:ss.SSS',
    includeMetadata: parseBool(process.env.LOG_INCLUDE_METADATA, true),
  },

  // ==================== FIREBASE ====================
  firebase: {
    useADC: parseBool(process.env.FIREBASE_USE_ADC, false),
    projectId: process.env.FIREBASE_PROJECT_ID || 'motsamai-10d22',
    databaseUrl: validateUrl(
      process.env.FIREBASE_DATABASE_URL || 'https://motsamai-10d22-default-rtdb.firebaseio.com',
      'FIREBASE_DATABASE_URL'
    ),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    serviceAccountJson: parseJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
  },

  // ==================== PAYMENT INTEGRATIONS ====================
  payments: {
    enabled: parseBool(process.env.ENABLE_PAYMENTS, true),
    signatureSecret: process.env.PAYMENT_SIGNATURE_SECRET || generateSecret(32),
    encryptionKey: process.env.PAYMENT_ENCRYPTION_KEY || generateSecret(32),

    // Stripe
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      webhookTolerance: parseIntEnv(process.env.STRIPE_WEBHOOK_TOLERANCE, 300000),
    },

    // M-Pesa
    mpesa: {
      consumerKey: process.env.MPESA_CONSUMER_KEY,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET,
      passkey: process.env.MPESA_PASSKEY,
      shortcode: process.env.MPESA_SHORTCODE,
      initiatorName: process.env.MPESA_INITIATOR_NAME,
      securityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
      environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
    },

    // EcoCash
    ecocash: {
      apiKey: process.env.ECOCASH_API_KEY,
      apiSecret: process.env.ECOCASH_API_SECRET,
      merchantId: process.env.ECOCASH_MERCHANT_ID,
      environment: process.env.ECOCASH_ENVIRONMENT || 'sandbox',
    },

    // Mobile Money
    mobileMoney: {
      defaultPhone: process.env.DEFAULT_PHONE_FOR_OAUTH || '+26600000000',
      autoCreate: parseBool(process.env.OAUTH_AUTO_CREATE, true),
    },
  },

  // ==================== EMAIL & SMS ====================
  communications: {
    // SendGrid
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    email: {
      from: process.env.EMAIL_FROM || '',
      fromName: process.env.EMAIL_FROM_NAME || 'Motsamai',
      replyTo: process.env.EMAIL_REPLY_TO || '',
    },

    // Twilio
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },

    // Features
    enableEmail: parseBool(process.env.ENABLE_EMAIL_NOTIFICATIONS, true),
    enableSms: parseBool(process.env.ENABLE_SMS_NOTIFICATIONS, true),
    enablePush: parseBool(process.env.ENABLE_PUSH_NOTIFICATIONS, true),
  },

  // ==================== STORAGE ====================
  storage: {
    // AWS S3 legacy config is kept for non-upload integrations.
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.AWS_S3_BUCKET,
      endpoint: process.env.AWS_ENDPOINT,
      forcePathStyle: parseBool(process.env.AWS_FORCE_PATH_STYLE, false),
    },
  },

  // ==================== EXTERNAL SERVICES ====================
  services: {
    google: {
      mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      region: process.env.GOOGLE_MAPS_REGION || 'us',
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      geocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY,
    },

    ai: {
      url: process.env.AI_SERVICE_URL || 'http://localhost:8000',
      enabled: parseBool(process.env.ENABLE_AI_SERVICES, false),
      apiKey: process.env.AI_SERVICE_API_KEY,
      timeout: parseIntEnv(process.env.AI_SERVICE_TIMEOUT, 30000),
    },
  },

  // ==================== WEBSOCKETS ====================
  websocket: {
    enabled: parseBool(process.env.ENABLE_WEBSOCKETS, true),
    path: process.env.SOCKET_PATH || '/socket.io',
    pingTimeout: parseIntEnv(process.env.SOCKET_PING_TIMEOUT, 5000),
    pingInterval: parseIntEnv(process.env.SOCKET_PING_INTERVAL, 25000),
    maxHttpBufferSize: parseIntEnv(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE, 1048576),
    transports: parseArray(process.env.SOCKET_TRANSPORTS, ['websocket', 'polling']),
    cors: {
      origin: parseArray(process.env.SOCKET_CORS_ORIGINS, defaultCorsOrigins),
      credentials: parseBool(process.env.SOCKET_CORS_CREDENTIALS, true),
    },
  },

  // ==================== MONITORING ====================
  monitoring: {
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || NODE_ENV,
      tracesSampleRate: parseFloatEnv(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    },
    metrics: {
      enabled: parseBool(process.env.ENABLE_METRICS, true),
      port: parseIntEnv(process.env.METRICS_PORT, 9090),
      path: process.env.METRICS_PATH || '/metrics',
    },
    health: {
      enabled: parseBool(process.env.ENABLE_HEALTH_CHECK, true),
      checkInterval: parseIntEnv(process.env.HEALTH_CHECK_INTERVAL, 30000),
    },
  },

  // ==================== CACHE STRATEGIES ====================
  cache: {
    defaultTTL: parseIntEnv(process.env.CACHE_DEFAULT_TTL, 3600),
    rideTTL: parseIntEnv(process.env.CACHE_RIDE_TTL, 300),
    userTTL: parseIntEnv(process.env.CACHE_USER_TTL, 600),
    locationTTL: parseIntEnv(process.env.CACHE_LOCATION_TTL, 10),
    configTTL: parseIntEnv(process.env.CACHE_CONFIG_TTL, 1800),
    statsTTL: parseIntEnv(process.env.CACHE_STATS_TTL, 60),
  },

  // ==================== PRICING ====================
  pricing: {
    baseFare: parseFloatEnv(process.env.BASE_FARE, 2.00),
    perKmRate: parseFloatEnv(process.env.PER_KM_RATE, 1.50),
    perMinuteRate: parseFloatEnv(process.env.PER_MINUTE_RATE, 0.30),
    minimumFare: parseFloatEnv(process.env.MINIMUM_FARE, 3.00),
    cancellationFee: parseFloatEnv(process.env.CANCELLATION_FEE, 2.00),
    waitingRatePerMinute: parseFloatEnv(process.env.WAITING_RATE_PER_MINUTE, 0.20),
    surgeMultiplierMax: parseFloatEnv(process.env.SURGE_MULTIPLIER_MAX, 3.00),
    surgeMultiplierMin: parseFloatEnv(process.env.SURGE_MULTIPLIER_MIN, 1.00),
    bookingFee: parseFloatEnv(process.env.BOOKING_FEE, 0.50),
    serviceFee: parseFloatEnv(process.env.SERVICE_FEE, 0.00),
    vatRate: parseFloatEnv(process.env.VAT_RATE, 0.15),
    currency: process.env.PRICING_CURRENCY || 'USD',
    taxInclusive: parseBool(process.env.PRICING_TAX_INCLUSIVE, true),
  },

  // ==================== FEATURE FLAGS ====================
  features: {
    enablePayments: parseBool(process.env.ENABLE_PAYMENTS, true),
    enableWebhooks: parseBool(process.env.ENABLE_WEBHOOKS, true),
    enablePushNotifications: parseBool(process.env.ENABLE_PUSH_NOTIFICATIONS, true),
    enableSmsNotifications: parseBool(process.env.ENABLE_SMS_NOTIFICATIONS, true),
    enableEmailNotifications: parseBool(process.env.ENABLE_EMAIL_NOTIFICATIONS, true),
    enableAuditLogs: parseBool(process.env.ENABLE_AUDIT_LOGS, true),
    enableAnalytics: parseBool(process.env.ENABLE_ANALYTICS, true),
    enableGeolocation: parseBool(process.env.ENABLE_GEOLOCATION, true),
    enablePromotions: parseBool(process.env.ENABLE_PROMOTIONS, true),
    enableReferrals: parseBool(process.env.ENABLE_REFERRALS, true),
    enableReviews: parseBool(process.env.ENABLE_REVIEWS, true),
    enableSupport: parseBool(process.env.ENABLE_SUPPORT, true),
    enableVehicleTracking: parseBool(process.env.ENABLE_VEHICLE_TRACKING, true),
    enableDriverEarnings: parseBool(process.env.ENABLE_DRIVER_EARNINGS, true),
    enableRideHistory: parseBool(process.env.ENABLE_RIDE_HISTORY, true),
    enableFleetManagement: parseBool(process.env.ENABLE_FLEET_MANAGEMENT, true),
    enableIncidentReporting: parseBool(process.env.ENABLE_INCIDENT_REPORTING, true),
    enableEmergencySOS: parseBool(process.env.ENABLE_EMERGENCY_SOS, true),
    enableRideSharing: parseBool(process.env.ENABLE_RIDE_SHARING, true),
    enableRideScheduling: parseBool(process.env.ENABLE_RIDE_SCHEDULING, true),
  },

  // ==================== SECURITY ====================
  security: {
    sessionSecret: process.env.SESSION_SECRET || generateSecret(32),
    cookieSecure: parseBool(process.env.COOKIE_SECURE, isProduction),
    cookieHttpOnly: parseBool(process.env.COOKIE_HTTP_ONLY, true),
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
    cookieMaxAge: parseIntEnv(process.env.COOKIE_MAX_AGE, 86400000),
    csrfProtection: parseBool(process.env.CSRF_PROTECTION, true),
    xssProtection: parseBool(process.env.XSS_PROTECTION, true),
    nosniff: parseBool(process.env.NOSNIFF, true),
    frameguard: process.env.FRAMEGUARD || 'deny',
    hidePoweredBy: parseBool(process.env.HIDE_POWERED_BY, true),
    hstsMaxAge: parseIntEnv(process.env.HSTS_MAX_AGE, 31536000),
  },

  // ==================== WEBHOOKS ====================
  webhooks: {
    enabled: parseBool(process.env.ENABLE_WEBHOOKS, true),
    timeout: parseIntEnv(process.env.WEBHOOK_TIMEOUT, 10000),
    maxRetries: parseIntEnv(process.env.WEBHOOK_MAX_RETRIES, 3),
    retryDelay: parseIntEnv(process.env.WEBHOOK_RETRY_DELAY, 1000),
  },

  // ==================== OTP / 2FA ====================
  otp: {
    length: parseIntEnv(process.env.OTP_LENGTH, 6),
    expirySeconds: parseIntEnv(process.env.OTP_EXPIRY_SECONDS, 300),
    maxAttempts: parseIntEnv(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldown: parseIntEnv(process.env.OTP_RESEND_COOLDOWN, 60),
  },

  // ==================== QUEUES ====================
  queues: {
    enabled: parseBool(process.env.QUEUES_ENABLED, true),
    concurrency: parseIntEnv(process.env.QUEUE_CONCURRENCY, 5),
    limiterMax: parseIntEnv(process.env.QUEUE_LIMITER_MAX, 100),
    limiterDuration: parseIntEnv(process.env.QUEUE_LIMITER_DURATION, 60000),
    stalledInterval: parseIntEnv(process.env.QUEUE_STALLED_INTERVAL, 30000),
    maxStalledCount: parseIntEnv(process.env.QUEUE_MAX_STALLED_COUNT, 3),
  },
};

// Backward-compatible aliases for older modules that still read uppercase config keys.
Object.assign(config, {
  NODE_ENV: config.app.env,
  PORT: config.app.port,
  HOST: config.app.host,
  API_VERSION: config.app.apiVersion,
  APP_NAME: config.app.name,
  APP_BASE_URL: config.app.baseUrl,
  FRONTEND_URL: config.app.frontendUrl,
  TRUST_PROXY: config.app.trustProxy,
  SERVER_TIMEOUT: config.server.timeout,
  KEEP_ALIVE_TIMEOUT: config.server.keepAliveTimeout,
  HEADERS_TIMEOUT: config.server.headersTimeout,
  MAX_HEADERS_COUNT: config.server.maxHeadersCount,
  SKIP_DB_CHECK: parseBool(process.env.SKIP_DB_CHECK, false),
  DATABASE: config.database,
  REDIS: config.redis,
  REDIS_URL: config.redis.url,
  JWT: config.jwt,
  JWT_SECRET: config.jwt.secret,
  JWT_EXPIRES_IN: config.jwt.expiresIn,
  JWT_REFRESH_SECRET: config.jwt.refreshSecret,
  JWT_REFRESH_EXPIRES_IN: config.jwt.refreshExpiresIn,
  BCRYPT_SALT_ROUNDS: config.bcrypt.saltRounds,
  ADMIN: config.admin,
  DEMO_ADMIN: config.demoAdmin,
  REAL_ADMIN: config.cynthia,
  SUPABASE: config.supabase,
  FIREBASE: config.firebase,
  FIREBASE_USE_ADC: config.firebase.useADC,
  FIREBASE_PROJECT_ID: config.firebase.projectId,
  FIREBASE_DATABASE_URL: config.firebase.databaseUrl,
  CORS_ORIGINS: config.cors.origins,
  CORS_CREDENTIALS: config.cors.credentials,
  ENABLE_WEBSOCKETS: isProduction || config.websocket.enabled,
  SOCKET_PATH: config.websocket.path,
  SOCKET_PING_TIMEOUT: config.websocket.pingTimeout,
  SOCKET_PING_INTERVAL: config.websocket.pingInterval,
  SOCKET_MAX_HTTP_BUFFER_SIZE: config.websocket.maxHttpBufferSize,
  CORS_METHODS: config.cors.methods,
  CORS_ALLOWED_HEADERS: config.cors.allowedHeaders,
  CORS_MAX_AGE: config.cors.maxAge,
  RATE_LIMIT_WINDOW_MS: config.rateLimit.windowMs,
  RATE_LIMIT_MAX_REQUESTS: config.rateLimit.max,
  RATE_LIMIT_SKIP_SUCCESSFUL: config.rateLimit.skipSuccessful,
  MAX_UPLOAD_SIZE: config.upload.maxSize,
  ALLOWED_FILE_TYPES: config.upload.allowedTypes,
});

// ==================== VALIDATE CRITICAL CONFIGURATION ====================

const validateConfig = () => {
  const errors = [];
  const warnings = [];

  if (isProduction && (!config.jwt.secret || !config.jwt.refreshSecret)) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET are required in production.');
  }

  // Check critical JWT secret
  if (config.jwt.secret === config.jwt.refreshSecret && isProduction) {
    warnings.push('JWT_SECRET and JWT_REFRESH_SECRET are identical. This is not recommended for production.');
  }

  // Check database configuration
  if (config.database.url) {
    if (!config.database.url.startsWith('postgresql://')) {
      warnings.push('DATABASE_URL should use postgresql:// protocol');
    }
  } else if (isProduction) {
    errors.push('DATABASE_URL is required in production. Configure the Supabase PostgreSQL connection string.');
  } else {
    if (!config.database.host || !config.database.database) {
      errors.push('Database configuration incomplete. Provide DATABASE_URL or DB_HOST, DB_NAME, etc.');
    }
  }

  // Check Supabase configuration
  if (config.supabase.url && !config.supabase.publishableKey) {
    warnings.push('SUPABASE_URL is set but no publishable key found. Supabase features may not work.');
  }

  // Check Redis configuration
  if (config.redis.url || config.redis.host) {
    // Redis is configured, but optional
  }

  // Check Firebase configuration
  if (
    config.firebase.projectId
    && !config.firebase.useADC
    && !config.firebase.serviceAccountJson
    && !(config.firebase.clientEmail && config.firebase.privateKey)
    && !config.firebase.serviceAccountPath
  ) {
    warnings.push('Firebase is configured with projectId but no service account credentials. Use ADC, split env vars, a service account path, or service account JSON.');
  }

  // Check CORS origins for production
  if (isProduction) {
    const hasWildcard = config.cors.origins.some(origin => origin === '*' || origin === '*');
    if (hasWildcard) {
      warnings.push('CORS origins contain wildcard (*) in production. This is not recommended.');
    }
  }

  // Log validation results
  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    if (isProduction && require.main === module) process.exit(1);
  }

  if (warnings.length > 0 && !isProduction) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach((warn) => console.warn(`  - ${warn}`));
  }

  return { errors, warnings };
};

// Run validation
const validation = validateConfig();

// ==================== EXPORT ====================

module.exports = config;
module.exports.validateConfig = validateConfig;
module.exports.isProduction = isProduction;
module.exports.isDevelopment = isDevelopment;
module.exports.isTest = isTest;
module.exports.isStaging = isStaging;
