const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('settings'),
  down: schema.down('settings'),
};
