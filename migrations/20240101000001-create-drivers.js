const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('drivers'),
  down: schema.down('drivers'),
};
