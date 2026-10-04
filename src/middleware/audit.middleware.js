const auditService = require('../services/auditService');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Middleware to log administrative actions.
 * This middleware should be placed after authentication and authorization middleware
 * to ensure `req.user` is populated and the user has the 'admin' role.
 */
const auditAdminAction = asyncHandler(async (req, res, next) => {
  // Only log if an authenticated admin user is performing the action
  if (!req.user || req.user.role !== 'admin') {
    return next();
  }

  const { method, originalUrl, params, body, ip, headers } = req;
  const userId = req.user.id;
  const userAgent = headers['user-agent'];
  const ipAddress = ip || req.connection.remoteAddress; // Fallback for IP address

  // Attempt to extract resource and resourceId from the URL/params
  let resource = originalUrl.split('?')[0]; // Remove query parameters
  let resourceId = null;

  // Common patterns for resource IDs in URL parameters
  if (params && Object.keys(params).length > 0) {
    const idParam = params.id || params.resourceId || params.userId || params.driverId || params.rideId;
    if (idParam) {
      resourceId = idParam;
      // Clean up resource path to be generic, e.g., /users/:id -> /users
      resource = resource.replace(`/${idParam}`, '');
    }
  }

  // Determine a more descriptive action string
  let action = `${method} ${resource}`;
  if (resourceId) {
    action += `/${resourceId}`;
  }

  // Sanitize sensitive fields from the request body before logging
  const sanitizedBody = { ...body };
  if (sanitizedBody.password) sanitizedBody.password = '********';
  if (sanitizedBody.password_hash) sanitizedBody.password_hash = '********';

  // Use the new AuditService
  auditService.logAction({
    userId,
    action,
    resource,
    resourceId,
    newValues: sanitizedBody,
    ipAddress,
    userAgent
  })
    .catch(err => {
      logger.error('Error during asynchronous audit logging:', err);
    });

  next();
});

module.exports = auditAdminAction;