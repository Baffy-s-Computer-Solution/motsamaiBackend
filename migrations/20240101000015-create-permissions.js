const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('permissions'),
  down: schema.down('permissions'),
};
