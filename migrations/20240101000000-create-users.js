const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('users'),
  down: schema.down('users'),
};
