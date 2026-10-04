const cors = require('cors');

const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
  maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400,
};

module.exports = cors(corsOptions);
