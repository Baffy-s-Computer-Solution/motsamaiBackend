const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('views'),
  down: schema.down('views'),
};
