const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('reviews'),
  down: schema.down('reviews'),
};
