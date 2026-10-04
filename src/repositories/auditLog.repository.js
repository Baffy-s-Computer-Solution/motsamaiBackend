const BaseRepository = require('./base.repository');
const { AuditLog } = require('../models'); // Assumes an AuditLog model exists in src/models

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }
}

module.exports = new AuditLogRepository();