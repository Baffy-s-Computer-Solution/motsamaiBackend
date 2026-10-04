const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('wallets'),
  down: schema.down('wallets'),
};
