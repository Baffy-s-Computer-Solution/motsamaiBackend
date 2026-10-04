const { AuditLog } = require('../models');
const logger = require('../utils/logger');

/**
 * AuditService - Tracks sensitive system changes for compliance and security
 */
class AuditService {
  /**
   * Logs an administrative or sensitive system action
   */
  async logAction({ userId, action, resource, resourceId, oldValues, newValues, ipAddress, userAgent }) {
    try {
      const log = await AuditLog.create({
        user_id: userId,
        action, // e.g., 'SUSPEND_USER', 'INITIATE_PAYOUT'
        resource, // e.g., 'User', 'Payment'
        resource_id: resourceId,
        old_values: oldValues ? JSON.stringify(oldValues) : null,
        new_values: newValues ? JSON.stringify(newValues) : null,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: new Date()
      });

      logger.info(`Audit Log Created: ${action} on ${resource}:${resourceId} by User ${userId}`);
      return log;
    } catch (error) {
      // We use logger.error but don't throw to prevent blocking the main business logic
      logger.error('Failed to create audit log:', error);
      return null;
    }
  }

  async getLogsByResource(resource, resourceId) {
    return await AuditLog.findAll({ where: { resource, resource_id: resourceId }, order: [['createdAt', 'DESC']] });
  }
}

module.exports = new AuditService();