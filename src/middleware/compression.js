const compression = require('compression');

module.exports = compression({ level: Number(process.env.COMPRESSION_LEVEL || 6) });
