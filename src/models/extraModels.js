const { DataTypes } = require('sequelize');

const id = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
const jsonDefault = { type: DataTypes.JSONB, allowNull: false, defaultValue: {} };

const defineAuditLog = (sequelize) =>
  sequelize.define('AuditLog', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(120), allowNull: false },
    entity_type: { type: DataTypes.STRING(80), allowNull: true },
    entity_id: { type: DataTypes.STRING(80), allowNull: true },
    before: { type: DataTypes.JSONB, allowNull: true },
    after: { type: DataTypes.JSONB, allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
  });

const defineDeviceInfo = (sequelize) =>
  sequelize.define('DeviceInfo', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: false },
    platform: { type: DataTypes.STRING(40), allowNull: false },
    device_token: { type: DataTypes.STRING(255), allowNull: true },
    app_version: { type: DataTypes.STRING(40), allowNull: true },
    os_version: { type: DataTypes.STRING(80), allowNull: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: true },
    metadata: jsonDefault,
  });

const defineDocument = (sequelize) =>
  sequelize.define('Document', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: false },
    vehicle_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    url: { type: DataTypes.STRING(1000), allowNull: true },
    public_id: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'verified', 'rejected', 'expired'), defaultValue: 'pending' },
    expiry_date: { type: DataTypes.DATE, allowNull: true },
    metadata: jsonDefault,
  });

const defineDriverStatus = (sequelize) =>
  sequelize.define('DriverStatus', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'offline' },
    last_location: { type: DataTypes.JSONB, allowNull: true },
    last_updated: { type: DataTypes.DATE, allowNull: true },
  });

const defineDriverLocation = (sequelize) =>
  sequelize.define('DriverLocation', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: false },
    ride_id: { type: DataTypes.UUID, allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    accuracy: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    heading: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    speed: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

const definePayout = (sequelize) =>
  sequelize.define('Payout', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    method: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    reference: { type: DataTypes.STRING(190), allowNull: true },
    metadata: jsonDefault,
  });

const defineIncident = (sequelize) =>
  sequelize.define('Incident', {
    id,
    ride_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    severity: { type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), defaultValue: 'medium' },
    status: { type: DataTypes.ENUM('open', 'investigating', 'resolved', 'closed'), defaultValue: 'open' },
    metadata: jsonDefault,
  });

const defineInviteCode = (sequelize) =>
  sequelize.define('InviteCode', {
    id,
    code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    role: { type: DataTypes.STRING(40), allowNull: true },
    max_uses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
  });

const defineLocationHistory = (sequelize) =>
  sequelize.define('LocationHistory', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: true },
    ride_id: { type: DataTypes.UUID, allowNull: true },
    lat: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    lng: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

const defineNotification = (sequelize) =>
  sequelize.define('Notification', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: false },
    channel: { type: DataTypes.ENUM('email', 'sms', 'push', 'in_app'), defaultValue: 'in_app' },
    title: { type: DataTypes.STRING(160), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'sent', 'failed', 'read'), defaultValue: 'pending' },
    metadata: jsonDefault,
    sent_at: { type: DataTypes.DATE, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'notifications',
    paranoid: false,
  });

const definePermission = (sequelize) =>
  sequelize.define('Permission', {
    id,
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    resource: { type: DataTypes.STRING(80), allowNull: false },
    action: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
  });

const defineReferral = (sequelize) =>
  sequelize.define('Referral', {
    id,
    referrer_id: { type: DataTypes.UUID, allowNull: false },
    referred_id: { type: DataTypes.UUID, allowNull: true },
    code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('pending', 'completed', 'rewarded'), defaultValue: 'pending' },
    reward_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  });

const defineRefreshToken = (sequelize) =>
  sequelize.define('RefreshToken', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  });

const defineReport = (sequelize) =>
  sequelize.define('Report', {
    id,
    name: { type: DataTypes.STRING(160), allowNull: false },
    type: { type: DataTypes.STRING(80), allowNull: false },
    status: { type: DataTypes.ENUM('queued', 'running', 'completed', 'failed'), defaultValue: 'queued' },
    parameters: jsonDefault,
    file_url: { type: DataTypes.STRING(500), allowNull: true },
    generated_by: { type: DataTypes.UUID, allowNull: true },
    generated_at: { type: DataTypes.DATE, allowNull: true },
  });

const defineReview = (sequelize) =>
  sequelize.define('Review', {
    id,
    ride_id: { type: DataTypes.UUID, allowNull: false },
    reviewer_id: { type: DataTypes.UUID, allowNull: false },
    reviewee_id: { type: DataTypes.UUID, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT, allowNull: true },
  });

const defineRole = (sequelize) =>
  sequelize.define('Role', {
    id,
    name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  });

const defineSession = (sequelize) =>
  sequelize.define('Session', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  });

const defineSettings = (sequelize) =>
  sequelize.define('Settings', {
    id,
    key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    value: jsonDefault,
    description: { type: DataTypes.TEXT, allowNull: true },
    is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  });

const defineTransaction = (sequelize) =>
  sequelize.define('Transaction', {
    id,
    wallet_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('credit', 'debit', 'refund', 'adjustment'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'USD' },
    status: { type: DataTypes.ENUM('pending', 'completed', 'failed', 'reversed'), defaultValue: 'pending' },
    reference: { type: DataTypes.STRING(190), allowNull: true },
    metadata: jsonDefault,
  });

const defineVehicle = (sequelize) =>
  sequelize.define('Vehicle', {
    id,
    driver_id: { type: DataTypes.UUID, allowNull: false },
    make: { type: DataTypes.STRING(80), allowNull: false },
    model: { type: DataTypes.STRING(80), allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: true },
    color: { type: DataTypes.STRING(40), allowNull: true },
    plate_number: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    status: { type: DataTypes.ENUM('active', 'inactive', 'maintenance'), defaultValue: 'active' },
  });

const defineWallet = (sequelize) =>
  sequelize.define('Wallet', {
    id,
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'USD' },
    status: { type: DataTypes.ENUM('active', 'frozen', 'closed'), defaultValue: 'active' },
  });

const defineWebhook = (sequelize) =>
  sequelize.define('Webhook', {
    id,
    provider: { type: DataTypes.STRING(80), allowNull: false },
    event_type: { type: DataTypes.STRING(120), allowNull: false },
    endpoint_url: { type: DataTypes.STRING(500), allowNull: true },
    payload: jsonDefault,
    status: { type: DataTypes.ENUM('received', 'processed', 'failed'), defaultValue: 'received' },
    processed_at: { type: DataTypes.DATE, allowNull: true },
  });

module.exports = {
  AuditLog: defineAuditLog,
  DeviceInfo: defineDeviceInfo,
  Document: defineDocument,
  DriverLocation: defineDriverLocation,
  DriverStatus: defineDriverStatus,
  Incident: defineIncident,
  InviteCode: defineInviteCode,
  LocationHistory: defineLocationHistory,
  Notification: defineNotification,
  Permission: definePermission,
  Payout: definePayout,
  Referral: defineReferral,
  RefreshToken: defineRefreshToken,
  Report: defineReport,
  Review: defineReview,
  Role: defineRole,
  Session: defineSession,
  Settings: defineSettings,
  Transaction: defineTransaction,
  Vehicle: defineVehicle,
  Wallet: defineWallet,
  Webhook: defineWebhook,
};
