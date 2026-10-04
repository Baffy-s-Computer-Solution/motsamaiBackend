const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('reports'),
  down: schema.down('reports'),
};
