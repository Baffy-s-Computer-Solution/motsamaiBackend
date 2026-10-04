const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('locationHistories'),
  down: schema.down('locationHistories'),
};
