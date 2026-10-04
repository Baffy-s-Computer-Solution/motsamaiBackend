const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('vehicles'),
  down: schema.down('vehicles'),
};
