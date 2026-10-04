const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('notifications'),
  down: schema.down('notifications'),
};
