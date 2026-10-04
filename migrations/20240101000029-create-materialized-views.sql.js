const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('materializedViews'),
  down: schema.down('materializedViews'),
};
