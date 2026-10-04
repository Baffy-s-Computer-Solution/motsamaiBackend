const schema = require('../config/migration-schema');

module.exports = {
  up: schema.up('auditLogs'),
  down: schema.down('auditLogs'),
};
