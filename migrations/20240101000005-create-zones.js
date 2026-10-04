const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('zones'),
  down: schema.down('zones'),
};
