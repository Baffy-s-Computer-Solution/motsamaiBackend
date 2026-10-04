const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('roles'),
  down: schema.down('roles'),
};
