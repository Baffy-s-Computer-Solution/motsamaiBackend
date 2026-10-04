/**
 * Production-ready Express App for Motsamai Backend
 * @version 3.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Initialize Express app
const app = express();

// ✅ CRITICAL FIX: Trust proxy for Render
// Render terminates TLS and forwards one trusted proxy hop.
// This lets express-rate-limit safely resolve the client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// ==================== SECURITY MIDDLEWARE ====================

// Set security HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// Enable CORS with specific options
const corsOptions = {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
};
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
    whitelist: [
        'limit', 'page', 'sort', 'fields', 'search',
        'lat', 'lng', 'radius', 'minPrice', 'maxPrice'
    ]
}));

// Compression middleware
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// ==================== RATE LIMITING ====================

// ✅ FIXED: General API rate limiter with proper proxy handling
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // ✅ FIX: Proper key generator for proxy
    keyGenerator: (req) => {
        // Use the IP from the proxy if trust proxy is set
        return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    },
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || 
               req.path === '/metrics' || 
               req.path.startsWith('/api/v1/health') ||
               req.path === '/';
    }
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 100,
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => req.ip || req.connection.remoteAddress,
});

// Apply rate limiters
app.use('/api', limiter);
app.use('/api/v1/auth', authLimiter);

// ==================== REQUEST LOGGING & TRACKING ====================

// Add request ID and correlation ID
const { v4: uuidv4 } = require('uuid');
app.use((req, res, next) => {
    req.requestId = uuidv4();
    req.correlationId = req.headers['x-correlation-id'] || req.requestId;
    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
});

app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
        logger.info({
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            requestId: req.requestId,
        }, `API ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
});

// Request logging
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        
        logger[logLevel]({
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            requestId: req.requestId,
            correlationId: req.correlationId,
            userAgent: req.get('user-agent'),
        }, `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
});

// ==================== HEALTH CHECK ENDPOINTS ====================

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'success',
        service: 'motsamai-web-backend',
        message: 'Motsamai backend is running',
        environment: process.env.NODE_ENV || 'development',
        version: require('./package.json').version,
        health: '/health',
        api: '/api/v1',
        docs: '/api-docs',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        requestId: req.requestId,
        version: require('./package.json').version,
    });
});

app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
    const checks = await performHealthChecks();
    
    if (checks.allPassed) {
        res.status(200).json({ status: 'ready', checks });
    } else {
        res.status(503).json({ status: 'not ready', checks });
    }
});

async function performHealthChecks() {
    const checks = {
        database: false,
        redis: false,
        allPassed: false,
        timestamp: new Date().toISOString(),
    };
    
    try {
        const { sequelize } = require('./src/models');
        await sequelize.authenticate();
        checks.database = true;
    } catch (error) {
        logger.error('Database health check failed:', error.message);
    }
    
    try {
        if (process.env.REDIS_URL) {
            const { redisClient } = require('./src/config/redis');
            if (redisClient && redisClient.isReady) {
                checks.redis = true;
            }
        } else {
            checks.redis = true;
        }
    } catch (error) {
        logger.error('Redis health check failed:', error.message);
    }
    
    checks.allPassed = checks.database && checks.redis;
    return checks;
}

// ==================== METRICS ENDPOINT ====================

app.get('/metrics', async (req, res) => {
    try {
        const client = require('prom-client');
        const metrics = await client.register.metrics();
        res.set('Content-Type', client.register.contentType);
        res.end(metrics);
    } catch (error) {
        logger.error('Metrics generation failed:', error);
        res.status(500).json({ error: 'Failed to generate metrics' });
    }
});

// ==================== API ROUTES ====================

// API documentation
try {
    const swaggerUi = require('swagger-ui-express');
    const swaggerDocument = require('./swagger.json');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    app.get('/api-docs.json', (req, res) => {
        res.json(swaggerDocument);
    });
} catch (error) {
    logger.warn('Swagger documentation not available:', error.message);
}

// Version endpoint
app.get('/api/version', (req, res) => {
    res.json({
        version: require('./package.json').version,
        environment: process.env.NODE_ENV || 'development',
        apiVersion: 'v1',
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/v1', (req, res) => {
    const apiRoutes = [
        '/api/v1/auth',
        '/api/v1/users',
        '/api/v1/rides',
        '/api/v1/drivers',
        '/api/v1/payments',
        '/api/v1/admin',
        '/api/v1/analytics',
        '/api/v1/fleet',
        '/api/v1/geofences',
        '/api/v1/health',
        '/api/v1/incidents',
        '/api/v1/notifications',
        '/api/v1/promotions',
        '/api/v1/reports',
        '/api/v1/reviews',
        '/api/v1/support',
        '/api/v1/uploads',
        '/api/v1/verification',
        '/api/v1/webhooks',
        '/api/v1/zones',
        '/api/v1/verification',
    ];
    
    res.status(200).json({
        success: true,
        service: 'motsamai-web-backend',
        version: require('./package.json').version,
        apiVersion: 'v1',
        health: '/api/v1/health',
        docs: '/api-docs',
        routes: apiRoutes,
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
    });
});

// ✅ FIXED: Mount all API routes with proper error handling
const mountRoute = (basePath, routePath) => {
    try {
        const route = require(routePath);
        app.use(basePath, route);
        logger.info(`✅ Mounted ${basePath} from ${routePath}`);
    } catch (error) {
        logger.error(`❌ Failed to mount ${basePath}: ${error.message}`);
        // Don't throw, just log the error
    }
};

// Mount all routes with absolute paths
mountRoute('/api/v1/auth', './src/routes/v1/authRoutes');
mountRoute('/api/v1/users', './src/routes/v1/userRoutes');
mountRoute('/api/v1/rides', './src/routes/v1/rideRoutes');
mountRoute('/api/v1/drivers', './src/routes/v1/driverRoutes');
mountRoute('/api/v1/payments', './src/routes/v1/paymentRoutes');
mountRoute('/api/v1/admin', './src/routes/v1/adminRoutes');
mountRoute('/api/v1/analytics', './src/routes/v1/analyticsRoutes');
mountRoute('/api/v1/fleet', './src/routes/v1/fleetRoutes');
mountRoute('/api/v1/geofences', './src/routes/v1/geofenceRoutes');
mountRoute('/api/v1/health', './src/routes/v1/healthRoutes');
mountRoute('/api/v1/incidents', './src/routes/v1/incidentRoutes');
mountRoute('/api/v1/notifications', './src/routes/v1/notificationRoutes');
mountRoute('/api/v1/promotions', './src/routes/v1/promotionRoutes');
mountRoute('/api/v1/reports', './src/routes/v1/reportRoutes');
mountRoute('/api/v1/reviews', './src/routes/v1/reviewRoutes');
mountRoute('/api/v1/support', './src/routes/v1/supportRoutes');
mountRoute('/api/v1/uploads', './src/routes/v1/uploadRoutes');
mountRoute('/api/v1/verification', './src/routes/v1/verificationRoutes');
mountRoute('/api/v1/ai', './src/routes/v1/aiRoutes');
mountRoute('/api/v1/webhooks', './src/routes/v1/webhookRoutes');
mountRoute('/api/v1/zones', './src/routes/v1/zoneRoutes');

// ==================== STATIC FILES ====================

if (process.env.NODE_ENV === 'production') {
    const staticPath = path.join(__dirname, 'public');
    const indexPath = path.join(staticPath, 'index.html');

    if (fs.existsSync(staticPath)) {
        app.use(express.static(staticPath));
    }
    
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            next();
        } else if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            next();
        }
    });
}

// ==================== ERROR HANDLING ====================

// Catch-all for undefined routes
app.use((req, res, next) => {
    const err = new Error(`Cannot find ${req.method} ${req.originalUrl} on this server!`);
    err.status = 'fail';
    err.statusCode = 404;
    err.isOperational = true;
    next(err);
});

// Global error handler
app.use(errorHandler);

module.exports = app;
