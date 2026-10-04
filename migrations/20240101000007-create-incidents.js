const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('incidents'),
  down: schema.down('incidents'),
};
