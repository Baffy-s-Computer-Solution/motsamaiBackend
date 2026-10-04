const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('refreshTokens'),
  down: schema.down('refreshTokens'),
};
