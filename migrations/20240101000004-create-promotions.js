const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('promotions'),
  down: schema.down('promotions'),
};
