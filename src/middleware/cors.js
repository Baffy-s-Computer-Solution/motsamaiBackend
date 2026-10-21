const cors = require('cors');
const config = require('../config');

const allowedOrigins = config.cors.origins.filter((origin) => origin !== '*');

const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  credentials: config.cors.credentials,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders,
  exposedHeaders: config.cors.exposedHeaders,
  maxAge: config.cors.maxAge,
  optionsSuccessStatus: 200,
};

module.exports = cors(corsOptions);
