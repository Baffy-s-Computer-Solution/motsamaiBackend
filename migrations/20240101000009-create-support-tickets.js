const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('supportTickets'),
  down: schema.down('supportTickets'),
};
