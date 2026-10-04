const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('referrals'),
  down: schema.down('referrals'),
};
