const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('indexes'),
  down: schema.down('indexes'),
};
