const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('foreignKeys'),
  down: schema.down('foreignKeys'),
};
