const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('transactions'),
  down: schema.down('transactions'),
};
