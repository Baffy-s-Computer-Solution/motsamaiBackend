const csvStringify = require('csv-stringify/sync');
const { Op, Sequelize } = require('sequelize');
const {
  Zone,
  sequelize,
  User,
  Driver,
  Ride,
  Payment,
  AuditLog,
  Settings,
  Vehicle,
  Review,
  Promotion,
  Incident,
  SupportTicket,
} = require('../models');
const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');
const { ApiResponse } = require('../utils/apiResponse');
const { ApiError } = require('../utils/apiError');

const safeAdminQuery = async (label, operation, fallback) => {
  try {
    return await operation();
  } catch (error) {
    logger.warn(`Admin ${label} query unavailable`, { error: error.message });
    return fallback;
  }
};

const defaultSystemSettings = {
  theme: 'light',
  pricing: {
    baseFare: 2.5,
    perKmRate: 1.5,
    perMinuteRate: 0.3,
    minimumFare: 5,
    cancellationFee: 3,
    surgeMultiplier: 1.0,
  },
  driverSettings: {
    commission: 20,
    maxDistanceKm: 5,
    driverWaitTime: 5,
    minimumRating: 4.0,
  },
  rideSettings: {
    maxRideDistance: 100,
    maxPassengers: 4,
    allowScheduledRides: true,
    advanceBookingWindow: 7,
  },
  paymentSettings: {
    supportedMethods: ['card', 'mobile_money', 'wallet'],
    walletMinBalance: 5,
    walletMaxBalance: 500,
    refundPeriod: 7,
  },
  notificationSettings: {
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    rideAlerts: true,
    promotionAlerts: true,
  },
  securitySettings: {
    twoFactorAuth: false,
    sessionTimeout: 3600,
    maxLoginAttempts: 5,
  },
  mapSettings: {
    defaultZoom: 12,
    maxZoom: 18,
    provider: 'google_maps',
  },
};

/**
 * AdminController - Administrative operations for platform managements
 */
class AdminController {
  /**
   * Real-time dashboards metrics (rides, revenue, users, drivers)
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

    const completedPaymentStatuses = ['succeeded', 'COMPLETED', 'completed'];
    const commissionRate = defaultSystemSettings.driverSettings.commission / 100;

    const [
      totalUsers,
      totalDrivers,
      onlineDrivers,
      totalBookingsToday,
      activeRides,
      cancelledBookings,
      dailyRevenue,
      totalRevenue,
      totalRides,
      completedRides,
      userGrowth,
      pendingVerifications,
      totalVehicles,
      availableVehicles,
    ] = await Promise.all([
      safeAdminQuery('total users', () => User.count(), 0),
      safeAdminQuery('total drivers', () => Driver.count(), 0),
      safeAdminQuery('online drivers', () => Driver.count({ where: { [Op.or]: [{ is_online: true }, { is_available: true }] } }), 0),
      safeAdminQuery('bookings today', () => Ride.count({ where: { createdAt: { [Op.gte]: today } } }), 0),
      safeAdminQuery('active rides', () => Ride.count({ where: { status: { [Op.in]: ['accepted', 'arrived', 'picked_up'] } } }), 0),
      safeAdminQuery('cancelled bookings', () => Ride.count({ where: { status: 'cancelled', createdAt: { [Op.gte]: today } } }), 0),
      safeAdminQuery('daily revenue', () => Payment.sum('amount', { where: { status: { [Op.in]: completedPaymentStatuses }, createdAt: { [Op.gte]: today } } }), 0),
      safeAdminQuery('total revenue', () => Payment.sum('amount', { where: { status: { [Op.in]: completedPaymentStatuses } } }), 0),
      safeAdminQuery('total rides', () => Ride.count(), 0),
      safeAdminQuery('completed rides', () => Ride.count({ where: { status: 'completed' } }), 0),
      safeAdminQuery('user growth', () => User.count({ where: { createdAt: { [Op.gte]: lastMonth } } }), 0),
      safeAdminQuery('pending verifications', () => Driver.count({ where: { verification_status: 'pending' } }), 0),
      safeAdminQuery('total vehicles', () => Vehicle.count(), 0),
      safeAdminQuery('available vehicles', () => Vehicle.count({ where: { status: { [Op.in]: ['active', 'available'] } } }), 0),
    ]);

    return res.json(new ApiResponse(200, {
      userMetrics: { totalUsers, monthlyGrowth: userGrowth, userGrowth },
      driverMetrics: { totalDrivers, onlineDrivers, pendingVerification: pendingVerifications },
      rideMetrics: {
        totalBookingsToday,
        activeRides,
        totalRides,
        completed: completedRides,
        cancelled: cancelledBookings,
        ridesToday: totalBookingsToday,
        completionRate: totalRides ? Math.round((completedRides / totalRides) * 100) : 0,
      },
      financialMetrics: {
        todayRevenue: Number(dailyRevenue || 0),
        revenueToday: Number(dailyRevenue || 0),
        totalRevenue: Number(totalRevenue || 0),
        commission: Number(totalRevenue || 0) * commissionRate,
        platformCommission: Number(totalRevenue || 0) * commissionRate,
      },
      verificationMetrics: { pending: pendingVerifications },
      fleetMetrics: { total: totalVehicles, available: availableVehicles },
      alertMetrics: {
        requiresAttention: pendingVerifications + cancelledBookings,
        cancelledBookings,
      },
      timestamp: new Date(),
    }, 'Dashboard stats retrieved'));
  });

  getOverviewStats = asyncHandler(async (req, res) => this.getDashboardStats(req, res));

  getRecentActivities = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const logs = await safeAdminQuery('recent activities', () => AuditLog.findAll({ limit, order: [['createdAt', 'DESC']] }), []);
    const activities = logs.map((log) => ({
      id: log.id,
      type: log.action || 'admin_action',
      title: String(log.action || 'Admin activity').replace(/_/g, ' '),
      description: log.description || `${log.entity_type || 'System'} ${log.entity_id || ''}`.trim(),
      user: log.user_id,
      status: 'success',
      timestamp: log.createdAt,
    }));

    return res.json(new ApiResponse(200, activities, 'Recent admin activities retrieved'));
  });

  getSystemAlerts = asyncHandler(async (req, res) => {
    const [pendingDrivers, failedPayments, cancelledToday] = await Promise.all([
      safeAdminQuery('pending driver alerts', () => Driver.count({ where: { verification_status: 'pending' } }), 0),
      safeAdminQuery('failed payment alerts', () => Payment.count({ where: { status: 'failed' } }), 0),
      safeAdminQuery('cancelled ride alerts', () => Ride.count({ where: { status: 'cancelled' } }), 0),
    ]);

    const alerts = [
      pendingDrivers ? {
        id: 'pending-drivers', severity: 'warning', message: `${pendingDrivers} driver applications need review`, read: false, timestamp: new Date(),
      } : null,
      failedPayments ? {
        id: 'failed-payments', severity: 'critical', message: `${failedPayments} payments failed or need follow-up`, read: false, timestamp: new Date(),
      } : null,
      cancelledToday ? {
        id: 'cancelled-bookings', severity: 'info', message: `${cancelledToday} cancelled bookings are available for review`, read: true, timestamp: new Date(),
      } : null,
    ].filter(Boolean);

    return res.json(new ApiResponse(200, alerts, 'System alerts retrieved'));
  });

  // get upcoming rides
  getUpcomingRides = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const rides = await safeAdminQuery('upcoming rides', () => Ride.findAll({
      where: { status: { [Op.in]: ['requested', 'searching', 'accepted'] } },
      limit,
      order: [['createdAt', 'DESC']],
    }), []);

    return res.json(new ApiResponse(200, rides, 'Upcoming bookings retrieved'));
  });

  getPlatformMetrics = asyncHandler(async (req, res) => {
    const rideStatuses = await safeAdminQuery('ride status metrics', () => Ride.findAll({
      attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'value']],
      group: ['status'],
      raw: true,
    }), []);

    const paymentStatuses = await safeAdminQuery('payment status metrics', () => Payment.findAll({
      attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'], [Sequelize.fn('SUM', Sequelize.col('amount')), 'total']],
      group: ['status'],
      raw: true,
    }), []);

    return res.json(new ApiResponse(200, {
      rideStatusDistribution: rideStatuses.map((row) => ({ name: row.status, value: Number(row.value || 0) })),
      revenueTrend: [],
      rideTrend: [],
      userGrowth: [],
      driverDistribution: [],
      hourlyActivity: [],
      payments: paymentStatuses,
    }, 'Platform metrics retrieved'));
  });

  getRideDistribution = asyncHandler(async (req, res) => {
    const rideStatuses = await safeAdminQuery('ride distribution', () => Ride.findAll({
      attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('id')), 'value']],
      group: ['status'],
      raw: true,
    }), []);

    return res.json(new ApiResponse(200, rideStatuses.map((row) => ({
      name: row.status,
      value: Number(row.value || 0),
    })), 'Ride distribution retrieved'));
  });

  getTopDrivers = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    let drivers = await safeAdminQuery('top drivers with users', () => Driver.findAll({
      limit,
      order: [['rating', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'phone'] }],
    }), null);
    if (!drivers) {
      drivers = await safeAdminQuery('top drivers fallback', () => Driver.findAll({ limit, order: [['createdAt', 'DESC']] }), []);
    }

    return res.json(new ApiResponse(200, drivers, 'Top drivers retrieved'));
  });

  getPopularRoutes = asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
    const routes = await safeAdminQuery('popular routes', () => Ride.findAll({
      attributes: [
        'pickup_address',
        'dropoff_address',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'rides'],
      ],
      group: ['pickup_address', 'dropoff_address'],
      order: [[Sequelize.literal('rides'), 'DESC']],
      limit,
      raw: true,
    }), []);

    return res.json(new ApiResponse(200, routes, 'Popular routes retrieved'));
  });

  getPaymentAnalytics = asyncHandler(async (req, res) => {
    const byMethod = await safeAdminQuery('payment analytics', () => Payment.findAll({
      attributes: [
        'provider',
        [Sequelize.fn('SUM', Sequelize.col('amount')), 'revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'transactions'],
      ],
      group: ['provider'],
      raw: true,
    }), []);

    return res.json(new ApiResponse(200, {
      byMethod: byMethod.map((row) => ({
        name: row.provider,
        revenue: Number(row.revenue || 0),
        transactions: Number(row.transactions || 0),
      })),
    }, 'Payment analytics retrieved'));
  });

  getLiveOperations = asyncHandler(async (req, res) => {
    const [drivers, bookings] = await Promise.all([
      safeAdminQuery('live drivers', () => Driver.findAll({ where: { [Op.or]: [{ is_online: true }, { is_available: true }] }, limit: 200 }), []),
      safeAdminQuery('live bookings', () => Ride.findAll({ where: { status: { [Op.in]: ['requested', 'searching', 'accepted', 'arrived', 'picked_up', 'in_progress'] } }, limit: 200, order: [['createdAt', 'DESC']] }), []),
    ]);

    return res.json(new ApiResponse(200, { drivers, bookings }, 'Live operations retrieved'));
  });

  getVerifications = asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = (page - 1) * limit;
    const { status, type } = req.query;
    const search = (req.query.search || '').trim();

    const where = {};
    if (status) where.verification_status = status;
    if (type && type !== 'driver') where.id = null;

    const include = [{
      model: User,
      as: 'user',
      attributes: ['id', 'email', 'phone', 'first_name', 'last_name', 'role', 'profile_picture'],
      ...(search ? {
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: `%${search}%` } },
            { first_name: { [Op.iLike]: `%${search}%` } },
            { last_name: { [Op.iLike]: `%${search}%` } },
            { phone: { [Op.iLike]: `%${search}%` } },
          ],
        },
      } : {}),
    }];

    let verificationResult = await safeAdminQuery('verifications with users', () => Driver.findAndCountAll({
      where,
      include,
      limit,
      offset,
      order: [['updatedAt', 'DESC']],
    }), null);

    if (!verificationResult) {
      verificationResult = await safeAdminQuery('verifications fallback', () => Driver.findAndCountAll({
        where,
        limit,
        offset,
        order: [['updatedAt', 'DESC']],
      }), { rows: [], count: 0 });
    }

    const { rows, count } = verificationResult;

    const verifications = rows.map((driver) => {
      const json = driver.toJSON();
      const user = json.user || {};
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

      return {
        id: json.id,
        type: 'driver',
        documentType: 'Driver profile',
        status: json.verification_status || 'pending',
        submittedAt: json.createdAt || json.created_at,
        reviewedAt: json.updatedAt || json.updated_at,
        priority: json.verification_status === 'pending' ? 'medium' : 'normal',
        notes: json.metadata?.verificationNotes || '',
        user: {
          id: user.id,
          name: name || user.email || 'Unknown User',
          email: user.email,
          phone: user.phone,
          role: user.role,
          avatar: user.profile_picture,
        },
        driver: json,
      };
    });

    return res.json(new ApiResponse(200, {
      verifications,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    }, 'Verifications retrieved'));
  });

  approveVerification = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) return res.status(404).json(new ApiResponse(404, null, 'Verification not found'));

    await driver.update({
      verification_status: 'approved',
      metadata: { ...(driver.metadata || {}), verificationNotes: req.body?.notes || '' },
    });

    return res.json(new ApiResponse(200, driver, 'Verification approved'));
  });

  rejectVerification = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) return res.status(404).json(new ApiResponse(404, null, 'Verification not found'));

    await driver.update({
      verification_status: 'rejected',
      metadata: { ...(driver.metadata || {}), verificationNotes: req.body?.notes || '' },
    });

    return res.json(new ApiResponse(200, driver, 'Verification rejected'));
  });

  deleteVerification = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) return res.status(404).json(new ApiResponse(404, null, 'Verification not found'));

    await driver.update({
      verification_status: 'pending',
      metadata: { ...(driver.metadata || {}), verificationNotes: 'Verification reset by admin' },
    });

    return res.json(new ApiResponse(200, null, 'Verification reset'));
  });

  /**
   * Delete user (Admin override)
   */
  deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findByPk(id);
    if (!user) throw new ApiError(404, 'User not found');

    // Soft delete with reason in metadata
    await user.update({
      is_active: false,
      status: 'deleted',
      metadata: { ...user.metadata, deletionReason: reason, deletedAt: new Date() },
    });

    logger.info(`Admin ${req.user.id} deleted user ${id}. Reason: ${reason}`);
    return res.json(new ApiResponse(200, null, 'User account deactivated by admin'));
  });

  /**
   * Verify or reject a driver
   */
  verifyDriverByAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body;

    const driver = await Driver.findByPk(id);
    if (!driver) throw new ApiError(404, 'Driver not found');

    await driver.update({
      verification_status: status,
      metadata: { ...driver.metadata, verificationNotes: reason },
    });

    return res.json(new ApiResponse(200, driver, `Driver status updated to ${status}`));
  });

  /**
   * Generate financial summary for reportRoutes
   */
  getFinancialSummary = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const where = { status: 'COMPLETED' };

    if (startDate && endDate) {
      where.createdAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    const summary = await Payment.findAll({
      where,
      attributes: [
        [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalRevenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'transactionCount'],
        'provider',
      ],
      group: ['provider'],
      raw: true,
    });

    const total = summary.reduce((acc, curr) => acc + parseFloat(curr.totalRevenue || 0), 0);

    return res.json(new ApiResponse(200, {
      providers: summary,
      totalRevenue: total,
      period: { startDate, endDate: endDate || new Date() },
    }, 'Financial summary generated'));
  });

  /**
   * Get system health metrics
   */
  getSystemHealth = asyncHandler(async (req, res) => {
    const dbStatus = await sequelize.authenticate().then(() => 'online').catch(() => 'offline');
    const memory = process.memoryUsage();

    return res.json(new ApiResponse(200, {
      database: dbStatus,
      uptime: process.uptime(),
      memory: {
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
      },
    }, 'System health retrieved'));
  });

  /**
   * Get paginated audit logs
   */
  getAuditLogs = asyncHandler(async (req, res) => {
    const {
      page = 1, limit = 50, action, userId,
    } = req.query;
    const where = {};
    if (action) where.action = action;
    if (userId) where.user_id = userId;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const { count, rows } = await safeAdminQuery('audit logs', () => AuditLog.findAndCountAll({
      where,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      logs: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }));
  });

  /**
   * Export audit logs to CSV
   */
  exportAuditLogs = asyncHandler(async (req, res) => {
    const logs = await AuditLog.findAll({ limit: 1000, order: [['createdAt', 'DESC']] });
    const data = logs.map((l) => l.get({ plain: true }));
    const csv = csvStringify(data, { header: true });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
    return res.send(csv);
  });

  /**
   * Admin modification of any user account
   */
  updateUserByAdmin = asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');

    await user.update(req.body);
    logger.info(`Admin ${req.user.id} updated user ${user.id}`);

    return res.json(new ApiResponse(200, user, 'User updated by administrator'));
  });

  createUserByAdmin = asyncHandler(async (req, res) => {
    const user = await User.create(req.body);
    return res.status(201).json(new ApiResponse(201, user, 'User created by administrator'));
  });

  updateUserStatusByAdmin = asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');

    await user.update({ status: req.body.status, is_active: req.body.status !== 'suspended' && req.body.status !== 'deleted' });
    return res.json(new ApiResponse(200, user, 'User status updated'));
  });

  bulkUpdateUserStatusByAdmin = asyncHandler(async (req, res) => {
    const { userIds = [], status } = req.body;
    await User.update(
      { status, is_active: status !== 'suspended' && status !== 'deleted' },
      { where: { id: { [Op.in]: userIds } } },
    );
    return res.json(new ApiResponse(200, { updated: userIds.length }, 'User statuses updated'));
  });

  /**
   * Creates a new geofence zone with PostGIS boundary.
   * Expects coords as [[lng, lat], [lng, lat], ...]
   */
  async createZone(req, res) {
    const { name, base_fare, coordinates } = req.body;

    try {
      // PostGIS requires Polygons to be closed (first and last point must be identical)
      const points = [...coordinates];
      if (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1]) {
        points.push(points[0]);
      }

      // Format: POLYGON((lng1 lat1, lng2 lat2, ...))
      const wktPolygon = `POLYGON((${points.map((p) => `${p[0]} ${p[1]}`).join(', ')}))`;

      // Spatial check: Prevent overlapping zones
      const overlappingZone = await Zone.findOne({
        where: sequelize.where(
          sequelize.fn(
            'ST_Intersects',
            sequelize.col('boundary'),
            sequelize.fn('ST_GeomFromText', wktPolygon, 4326),
          ),
          true,
        ),
      });

      if (overlappingZone) {
        return res.status(400).json({
          status: 'error',
          message: `Zone boundaries overlap with an existing zone: ${overlappingZone.name}`,
        });
      }

      const zone = await Zone.create({
        name,
        base_fare,
        boundary: sequelize.fn('ST_GeomFromText', wktPolygon, 4326),
      });

      logger.info(`New geofence zone created: ${name}`);
      return res.status(201).json({
        status: 'success',
        data: zone,
      });
    } catch (error) {
      logger.error('Failed to create geofence zone:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Admin lists all users with pagination
   */
  getAllUsers = asyncHandler(async (req, res) => {
    const {
      page = 1, limit = 10, search, role, status, sortBy = 'createdAt', sortOrder = 'DESC',
    } = req.query;
    const where = {};
    const safeSortFields = ['createdAt', 'updatedAt', 'email', 'first_name', 'last_name', 'role', 'status'];

    if (search) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (role) where.role = role;
    if (status) where.status = status;

    const orderField = safeSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const { count, rows } = await safeAdminQuery('users list', () => User.findAndCountAll({
      where,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [[orderField, orderDirection]],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      users: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }));
  });

  getRides = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    if (status) {
      where.status = status;
    }

    const { count, rows } = await safeAdminQuery('rides list', () => Ride.findAndCountAll({
      where,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      rides: rows,
      total: count,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        pages: Math.ceil(count / pageSize),
      },
    }, 'Rides retrieved successfully'));
  });

  getSystemSettings = asyncHandler(async (req, res) => {
    const setting = await safeAdminQuery('system settings', () => Settings.findOne({ where: { key: 'system' } }), null);
    const settingsValue = setting ? setting.value : defaultSystemSettings;
    return res.json(new ApiResponse(200, settingsValue, 'System settings retrieved'));
  });

  updateSystemSettings = asyncHandler(async (req, res) => {
    const [setting] = await Settings.findOrCreate({
      where: { key: 'system' },
      defaults: {
        value: defaultSystemSettings,
        description: 'System-wide platform settings',
        is_public: false,
      },
    });

    setting.value = { ...setting.value, ...req.body };
    await setting.save();

    return res.json(new ApiResponse(200, setting.value, 'System settings updated'));
  });

  /**
   * Fetches all defined zones for the management interface.
   */
  async getAllZones(req, res) {
    try {
      const zones = await Zone.findAll();
      return res.json({ status: 'success', data: zones });
    } catch (error) {
      logger.warn('Admin zones list unavailable', { error: error.message });
      return res.json({ status: 'success', data: [] });
    }
  }

  /**
   * Update driver online status or approval
   */
  updateDriverStatusByAdmin = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) throw new ApiError(404, 'Driver not found');

    const { is_online, status } = req.body;
    const updates = {};
    if (is_online !== undefined) updates.is_online = is_online;
    if (status) updates.status = status;

    await driver.update(updates);

    return res.json(new ApiResponse(200, driver, 'Driver status updated'));
  });

  getDriverStats = asyncHandler(async (req, res) => {
    const [total, active, pending, suspended, online] = await Promise.all([
      Driver.count(),
      Driver.count({ where: { status: { [Op.in]: ['active', 'available', 'approved'] } } }),
      Driver.count({ where: { verification_status: 'pending' } }),
      Driver.count({ where: { status: 'suspended' } }),
      Driver.count({ where: { [Op.or]: [{ is_online: true }, { is_available: true }] } }),
    ]);

    return res.json(new ApiResponse(200, {
      total, active, pending, suspended, online,
    }, 'Driver stats retrieved'));
  });

  createDriverByAdmin = asyncHandler(async (req, res) => {
    const { user: userPayload = {}, vehicle: vehiclePayload = {}, ...driverPayload } = req.body;
    const user = await User.create({ ...userPayload, role: 'driver' });
    const driver = await Driver.create({ ...driverPayload, user_id: user.id, verification_status: driverPayload.verification_status || 'pending' });

    if (Object.keys(vehiclePayload).length) {
      await Vehicle.create({ ...vehiclePayload, driver_id: driver.id });
    }

    return res.status(201).json(new ApiResponse(201, driver, 'Driver created by administrator'));
  });

  updateDriverByAdmin = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) throw new ApiError(404, 'Driver not found');

    const { user, vehicle, ...driverUpdates } = req.body;
    await driver.update(driverUpdates);

    if (user && driver.user_id) {
      await User.update(user, { where: { id: driver.user_id } });
    }

    if (vehicle) {
      const existingVehicle = await Vehicle.findOne({ where: { driver_id: driver.id } });
      if (existingVehicle) await existingVehicle.update(vehicle);
      else await Vehicle.create({ ...vehicle, driver_id: driver.id });
    }

    return res.json(new ApiResponse(200, driver, 'Driver updated'));
  });

  deleteDriverByAdmin = asyncHandler(async (req, res) => {
    const driver = await Driver.findByPk(req.params.id);
    if (!driver) throw new ApiError(404, 'Driver not found');

    await driver.update({ status: 'deleted', is_available: false, is_online: false });
    return res.json(new ApiResponse(200, null, 'Driver deactivated'));
  });

  exportDrivers = asyncHandler(async (req, res) => {
    const drivers = await Driver.findAll({
      include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'phone'] }],
      limit: 5000,
      order: [['createdAt', 'DESC']],
    });

    const data = drivers.map((driver) => ({
      id: driver.id,
      name: [driver.user?.first_name, driver.user?.last_name].filter(Boolean).join(' '),
      email: driver.user?.email || '',
      phone: driver.user?.phone || '',
      status: driver.status || '',
      verification_status: driver.verification_status || '',
      rating: driver.average_rating || driver.rating || '',
      created_at: driver.createdAt,
    }));

    const csv = csvStringify.stringify ? csvStringify.stringify(data, { header: true }) : csvStringify(data, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=motsamai-drivers.csv');
    return res.send(csv);
  });

  deleteRideByAdmin = asyncHandler(async (req, res) => {
    const ride = await Ride.findByPk(req.params.id);
    if (!ride) throw new ApiError(404, 'Ride not found');

    await ride.update({ status: 'deleted' });
    return res.json(new ApiResponse(200, null, 'Ride removed from active admin views'));
  });

  getDriverPerformance = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const driver = await Driver.findByPk(id);
    if (!driver) throw new ApiError(404, 'Driver not found');

    const rides = await Ride.findAll({
      where: { driver_id: id },
      attributes: [
        'status',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
        [Sequelize.fn('SUM', Sequelize.col('fare_amount')), 'revenue'],
        [Sequelize.fn('AVG', Sequelize.col('distance_km')), 'averageDistance'],
      ],
      group: ['status'],
      raw: true,
    });

    const reviews = await AuditLog.count({
      where: { entity_type: 'driver', entity_id: String(id) },
    });

    return res.json(new ApiResponse(200, {
      driver,
      rides,
      auditEvents: reviews,
    }, 'Driver performance retrieved'));
  });

  getSystemMetrics = asyncHandler(async (req, res) => {
    const [users, drivers, rides, payments] = await Promise.all([
      User.count(),
      Driver.count(),
      Ride.count(),
      Payment.findAll({
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
          [Sequelize.fn('SUM', Sequelize.col('amount')), 'total'],
        ],
        group: ['status'],
        raw: true,
      }),
    ]);

    return res.json(new ApiResponse(200, {
      users,
      drivers,
      rides,
      payments,
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    }, 'System metrics retrieved'));
  });

  getVehicles = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await safeAdminQuery('vehicles list', () => Vehicle.findAndCountAll({
      where,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      vehicles: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Vehicles retrieved successfully'));
  });

  deleteVehicleByAdmin = asyncHandler(async (req, res) => {
    const vehicle = await Vehicle.findByPk(req.params.id);
    if (!vehicle) throw new ApiError(404, 'Vehicle not found');
    await vehicle.update({ status: 'deleted' });
    return res.json(new ApiResponse(200, null, 'Vehicle removed from active admin views'));
  });

  getPayments = asyncHandler(async (req, res) => {
    const {
      page = 1, limit = 20, status, provider,
    } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const where = {};
    if (status) where.status = status;
    if (provider) where.provider = provider;

    const { count, rows } = await safeAdminQuery('payments list', () => Payment.findAndCountAll({
      where,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      payments: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Payments retrieved successfully'));
  });

  getReviews = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const { count, rows } = await safeAdminQuery('reviews list', () => Review.findAndCountAll({
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      reviews: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Reviews retrieved successfully'));
  });

  getPromotions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const { count, rows } = await safeAdminQuery('promotions list', () => Promotion.findAndCountAll({
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      promotions: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Promotions retrieved successfully'));
  });

  getIncidents = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const { count, rows } = await safeAdminQuery('incidents list', () => Incident.findAndCountAll({
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      incidents: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Incidents retrieved successfully'));
  });

  getSupportTickets = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const { count, rows } = await safeAdminQuery('support tickets list', () => SupportTicket.findAndCountAll({
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      order: [['createdAt', 'DESC']],
    }), { count: 0, rows: [] });

    return res.json(new ApiResponse(200, {
      tickets: rows,
      supportTickets: rows,
      total: count,
      pagination: { page: pageNumber, limit: pageSize, pages: Math.ceil(count / pageSize) },
    }, 'Support tickets retrieved successfully'));
  });

  getFleets = asyncHandler(async (req, res) => res.json(new ApiResponse(200, {
    fleets: [],
    total: 0,
    pagination: { page: 1, limit: 20, pages: 0 },
  }, 'Fleets retrieved successfully')));

  /**
   * Deletes a geofence zone by ID.
   */
  async deleteZone(req, res) {
    const { id } = req.params;
    try {
      const deleted = await Zone.destroy({ where: { id } });
      if (!deleted) {
        return res.status(404).json({ status: 'error', message: 'Zone not found' });
      }
      return res.json({ status: 'success', message: 'Zone deleted successfully' });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Finds which zone a coordinate belongs to.
   */
  async checkLocationZone(req, res) {
    const { lat, lng } = req.query;

    try {
      const zone = await Zone.findOne({
        where: sequelize.where(
          sequelize.fn(
            'ST_Contains',
            sequelize.col('boundary'),
            sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', lng, lat), 4326),
          ),
          true,
        ),
      });

      return res.json({ inZone: !!zone, zone });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Finds the nearest geofence zone to a given coordinate.
   * Returns the zone and the distance to its boundary.
   */
  async findNearestZone(req, res) {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ status: 'error', message: 'Latitude and longitude are required.' });
    }

    try {
      const point = sequelize.fn('ST_SetSRID', sequelize.fn('ST_MakePoint', lng, lat), 4326);

      const nearestZone = await Zone.findOne({
        attributes: {
          include: [
            [sequelize.fn('ST_Distance', sequelize.col('boundary'), point), 'distance_meters'],
          ],
        },
        order: sequelize.literal('distance_meters ASC'),
        limit: 1,
      });

      return res.json({ status: 'success', data: nearestZone });
    } catch (error) {
      logger.error('Failed to find nearest geofence zone:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }
}

module.exports = new AdminController();
