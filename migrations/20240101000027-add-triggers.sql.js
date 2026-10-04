const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('triggers'),
  down: schema.down('triggers'),
};
