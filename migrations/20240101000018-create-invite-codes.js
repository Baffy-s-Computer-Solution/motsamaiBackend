const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('inviteCodes'),
  down: schema.down('inviteCodes'),
};
