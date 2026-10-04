const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('deviceInfos'),
  down: schema.down('deviceInfos'),
};
