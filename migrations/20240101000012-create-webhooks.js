const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('webhooks'),
  down: schema.down('webhooks'),
};
