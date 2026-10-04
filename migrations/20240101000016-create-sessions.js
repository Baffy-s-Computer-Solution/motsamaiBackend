const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('sessions'),
  down: schema.down('sessions'),
};
