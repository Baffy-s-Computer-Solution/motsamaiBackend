const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('payments'),
  down: schema.down('payments'),
};
