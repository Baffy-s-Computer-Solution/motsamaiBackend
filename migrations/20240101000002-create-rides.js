const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('rides'),
  down: schema.down('rides'),
};
