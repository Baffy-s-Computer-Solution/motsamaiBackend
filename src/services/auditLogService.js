const BaseService = require('./base.service');
const auditLogRepository = require('../repositories/auditLog.repository');
const logger = require('../utils/logger');

class AuditLogService extends BaseService {
  constructor() {
    super(auditLogRepository);
  }

  /**
   * Logs an administrative action.
   * This method is designed to be non-blocking and resilient to errors,
   * as audit logging should not prevent the main request from completing.
   */
  async logAdminAction(userId, action, resource, resourceId, details, ipAddress, userAgent) {
    try {
      await this.create({
        user_id: userId,
        action: action,
        resource: resource,
        resource_id: resourceId,
        details: details,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    } catch (error) {
      logger.error('Failed to log admin action:', { userId, action, resource, resourceId, error: error.message });
      // Do not re-throw; audit logging failures should not break the main request flow.
    }
  }
}

module.exports = new AuditLogService();