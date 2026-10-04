const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    return false;
  }
};

const createTableIfMissing = async (queryInterface, Sequelize, tableName, columns, options = {}) => {
  if (!(await tableExists(queryInterface, tableName))) {
    await queryInterface.createTable(tableName, columns, options);
    return;
  }

  const existingColumns = await queryInterface.describeTable(tableName);
  for (const [columnName, columnDefinition] of Object.entries(columns)) {
    if (!existingColumns[columnName]) {
      await queryInterface.addColumn(tableName, columnName, columnDefinition);
    }
  }
};

const dropTableIfExists = async (queryInterface, tableName) => {
  if (await tableExists(queryInterface, tableName)) {
    await queryInterface.dropTable(tableName);
  }
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options = {}) => {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }
  const indexes = await queryInterface.showIndex(tableName);
  const name = options.name || `${tableName}_${fields.join('_')}`;
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(tableName, fields, { ...options, name });
  }
};

const addConstraintIfMissing = async (queryInterface, tableName, options) => {
  if (!(await tableExists(queryInterface, tableName))) {
    return;
  }
  const [constraints] = await queryInterface.sequelize.query(
    `
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = current_schema()
        AND table_name = :tableName
        AND constraint_name = :constraintName
    `,
    { replacements: { tableName, constraintName: options.name } },
  );
  if (constraints.length === 0) {
    await queryInterface.addConstraint(tableName, options);
  }
};

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
});

const bigId = (Sequelize) => ({ type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true });
const ref = (Sequelize, table, allowNull = false) => ({
  type: Sequelize.BIGINT,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: allowNull ? 'SET NULL' : 'CASCADE',
});

const migrations = {
  users: {
    table: 'User',
    up: (qi, S) => createTableIfMissing(qi, S, 'User', {
      id: bigId(S),
      firebase_uid: { type: S.STRING(128), allowNull: true, unique: true },
      name: { type: S.STRING(120), allowNull: false },
      email: { type: S.STRING(190), allowNull: false, unique: true },
      password_hash: { type: S.STRING(255), allowNull: true },
      role: { type: S.ENUM('admin', 'driver', 'rider', 'support'), allowNull: false, defaultValue: 'rider' },
      phone: { type: S.STRING(32), allowNull: true },
      avatar_url: { type: S.STRING(255), allowNull: true },
      status: { type: S.ENUM('active', 'suspended', 'pending'), allowNull: false, defaultValue: 'active' },
      last_login: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  drivers: {
    table: 'Driver',
    up: (qi, S) => createTableIfMissing(qi, S, 'Driver', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      license_number: { type: S.STRING(64), allowNull: false },
      verification_status: { type: S.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
      rating: { type: S.DECIMAL(3, 2), allowNull: false, defaultValue: 5.0 },
      is_online: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: S.ENUM('available', 'busy', 'offline'), allowNull: false, defaultValue: 'offline' },
      current_lat: { type: S.DECIMAL(10, 7), allowNull: true },
      current_lng: { type: S.DECIMAL(10, 7), allowNull: true },
      ...timestamps(S),
    }),
  },
  rides: {
    table: 'Ride',
    up: (qi, S) => createTableIfMissing(qi, S, 'Ride', {
      id: bigId(S),
      rider_id: ref(S, 'User'),
      driver_id: ref(S, 'Driver', true),
      pickup_address: { type: S.STRING(255), allowNull: false },
      dropoff_address: { type: S.STRING(255), allowNull: false },
      pickup_lat: { type: S.DECIMAL(10, 7), allowNull: true },
      pickup_lng: { type: S.DECIMAL(10, 7), allowNull: true },
      dropoff_lat: { type: S.DECIMAL(10, 7), allowNull: true },
      dropoff_lng: { type: S.DECIMAL(10, 7), allowNull: true },
      status: { type: S.ENUM('requested', 'accepted', 'arrived', 'in_progress', 'completed', 'cancelled'), allowNull: false, defaultValue: 'requested' },
      distance_km: { type: S.DECIMAL(10, 2), allowNull: true },
      fare_amount: { type: S.DECIMAL(10, 2), allowNull: true },
      ...timestamps(S),
    }),
  },
  payments: {
    table: 'Payment',
    up: (qi, S) => createTableIfMissing(qi, S, 'Payment', {
      id: bigId(S),
      ride_id: ref(S, 'Ride'),
      user_id: ref(S, 'User'),
      provider: { type: S.ENUM('stripe', 'cash', 'wallet'), allowNull: false, defaultValue: 'stripe' },
      provider_ref: { type: S.STRING(190), allowNull: true },
      amount: { type: S.DECIMAL(10, 2), allowNull: false },
      currency: { type: S.STRING(8), allowNull: false, defaultValue: 'USD' },
      status: { type: S.ENUM('pending', 'succeeded', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
      ...timestamps(S),
    }),
  },
  promotions: {
    table: 'Promotion',
    up: (qi, S) => createTableIfMissing(qi, S, 'Promotion', {
      id: bigId(S),
      code: { type: S.STRING(64), allowNull: false, unique: true },
      discount_type: { type: S.ENUM('fixed', 'percent'), allowNull: false, defaultValue: 'percent' },
      discount_value: { type: S.DECIMAL(10, 2), allowNull: false },
      is_active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      starts_at: { type: S.DATE, allowNull: true },
      ends_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  zones: {
    table: 'Zone',
    up: (qi, S) => createTableIfMissing(qi, S, 'Zone', {
      id: bigId(S),
      name: { type: S.STRING(120), allowNull: false, unique: true },
      city: { type: S.STRING(120), allowNull: false },
      base_fare: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 1.5 },
      per_km_rate: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 1.0 },
      is_active: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(S),
    }),
  },
  vehicles: {
    table: 'Vehicle',
    up: (qi, S) => createTableIfMissing(qi, S, 'Vehicle', {
      id: bigId(S),
      driver_id: ref(S, 'Driver'),
      make: { type: S.STRING(80), allowNull: false },
      model: { type: S.STRING(80), allowNull: false },
      year: { type: S.INTEGER, allowNull: true },
      color: { type: S.STRING(40), allowNull: true },
      plate_number: { type: S.STRING(32), allowNull: false, unique: true },
      capacity: { type: S.INTEGER, allowNull: false, defaultValue: 4 },
      status: { type: S.ENUM('active', 'inactive', 'maintenance'), allowNull: false, defaultValue: 'active' },
      ...timestamps(S),
    }),
  },
  incidents: {
    table: 'Incident',
    up: (qi, S) => createTableIfMissing(qi, S, 'Incident', {
      id: bigId(S),
      ride_id: ref(S, 'Ride', true),
      user_id: ref(S, 'User', true),
      type: { type: S.STRING(80), allowNull: false },
      description: { type: S.TEXT, allowNull: false },
      severity: { type: S.ENUM('low', 'medium', 'high', 'critical'), allowNull: false, defaultValue: 'medium' },
      status: { type: S.ENUM('open', 'investigating', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
      metadata: { type: S.JSONB, allowNull: false, defaultValue: {} },
      ...timestamps(S),
    }),
  },
  reviews: {
    table: 'Review',
    up: (qi, S) => createTableIfMissing(qi, S, 'Review', {
      id: bigId(S),
      ride_id: ref(S, 'Ride'),
      reviewer_id: ref(S, 'User'),
      reviewee_id: ref(S, 'User'),
      rating: { type: S.INTEGER, allowNull: false },
      comment: { type: S.TEXT, allowNull: true },
      ...timestamps(S),
    }),
  },
  supportTickets: {
    table: 'SupportTicket',
    up: (qi, S) => createTableIfMissing(qi, S, 'SupportTicket', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      subject: { type: S.STRING(190), allowNull: false },
      message: { type: S.TEXT, allowNull: false },
      status: { type: S.ENUM('open', 'in_progress', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
      ...timestamps(S),
    }),
  },
  auditLogs: {
    table: 'AuditLog',
    up: (qi, S) => createTableIfMissing(qi, S, 'AuditLog', {
      id: bigId(S),
      user_id: ref(S, 'User', true),
      action: { type: S.STRING(120), allowNull: false },
      entity_type: { type: S.STRING(80), allowNull: true },
      entity_id: { type: S.STRING(80), allowNull: true },
      before: { type: S.JSONB, allowNull: true },
      after: { type: S.JSONB, allowNull: true },
      ip_address: { type: S.STRING(64), allowNull: true },
      user_agent: { type: S.TEXT, allowNull: true },
      ...timestamps(S),
    }),
  },
  notifications: {
    table: 'Notification',
    up: (qi, S) => createTableIfMissing(qi, S, 'Notification', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      channel: { type: S.ENUM('email', 'sms', 'push', 'in_app'), allowNull: false, defaultValue: 'in_app' },
      title: { type: S.STRING(160), allowNull: false },
      body: { type: S.TEXT, allowNull: false },
      status: { type: S.ENUM('pending', 'sent', 'failed', 'read'), allowNull: false, defaultValue: 'pending' },
      metadata: { type: S.JSONB, allowNull: false, defaultValue: {} },
      sent_at: { type: S.DATE, allowNull: true },
      read_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  webhooks: {
    table: 'Webhook',
    up: (qi, S) => createTableIfMissing(qi, S, 'Webhook', {
      id: bigId(S),
      provider: { type: S.STRING(80), allowNull: false },
      event_type: { type: S.STRING(120), allowNull: false },
      endpoint_url: { type: S.STRING(500), allowNull: true },
      payload: { type: S.JSONB, allowNull: false, defaultValue: {} },
      status: { type: S.ENUM('received', 'processed', 'failed'), allowNull: false, defaultValue: 'received' },
      processed_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  reports: {
    table: 'Report',
    up: (qi, S) => createTableIfMissing(qi, S, 'Report', {
      id: bigId(S),
      name: { type: S.STRING(160), allowNull: false },
      type: { type: S.STRING(80), allowNull: false },
      status: { type: S.ENUM('queued', 'running', 'completed', 'failed'), allowNull: false, defaultValue: 'queued' },
      parameters: { type: S.JSONB, allowNull: false, defaultValue: {} },
      file_url: { type: S.STRING(500), allowNull: true },
      generated_by: ref(S, 'User', true),
      generated_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  roles: {
    table: 'Role',
    up: (qi, S) => createTableIfMissing(qi, S, 'Role', {
      id: bigId(S),
      name: { type: S.STRING(80), allowNull: false, unique: true },
      description: { type: S.TEXT, allowNull: true },
      is_system: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(S),
    }),
  },
  permissions: {
    table: 'Permission',
    up: (qi, S) => createTableIfMissing(qi, S, 'Permission', {
      id: bigId(S),
      name: { type: S.STRING(120), allowNull: false, unique: true },
      resource: { type: S.STRING(80), allowNull: false },
      action: { type: S.STRING(80), allowNull: false },
      description: { type: S.TEXT, allowNull: true },
      ...timestamps(S),
    }),
  },
  sessions: {
    table: 'Session',
    up: (qi, S) => createTableIfMissing(qi, S, 'Session', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      token_hash: { type: S.STRING(255), allowNull: false, unique: true },
      ip_address: { type: S.STRING(64), allowNull: true },
      user_agent: { type: S.TEXT, allowNull: true },
      expires_at: { type: S.DATE, allowNull: false },
      revoked_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  refreshTokens: {
    table: 'RefreshToken',
    up: (qi, S) => createTableIfMissing(qi, S, 'RefreshToken', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      token_hash: { type: S.STRING(255), allowNull: false, unique: true },
      expires_at: { type: S.DATE, allowNull: false },
      revoked_at: { type: S.DATE, allowNull: true },
      ...timestamps(S),
    }),
  },
  inviteCodes: {
    table: 'InviteCode',
    up: (qi, S) => createTableIfMissing(qi, S, 'InviteCode', {
      id: bigId(S),
      code: { type: S.STRING(80), allowNull: false, unique: true },
      role: { type: S.STRING(40), allowNull: true },
      max_uses: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      used_count: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      expires_at: { type: S.DATE, allowNull: true },
      created_by: ref(S, 'User', true),
      ...timestamps(S),
    }),
  },
  referrals: {
    table: 'Referral',
    up: (qi, S) => createTableIfMissing(qi, S, 'Referral', {
      id: bigId(S),
      referrer_id: ref(S, 'User'),
      referred_id: ref(S, 'User', true),
      code: { type: S.STRING(80), allowNull: false, unique: true },
      status: { type: S.ENUM('pending', 'completed', 'rewarded'), allowNull: false, defaultValue: 'pending' },
      reward_amount: { type: S.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      ...timestamps(S),
    }),
  },
  wallets: {
    table: 'Wallet',
    up: (qi, S) => createTableIfMissing(qi, S, 'Wallet', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      balance: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: S.STRING(8), allowNull: false, defaultValue: 'USD' },
      status: { type: S.ENUM('active', 'frozen', 'closed'), allowNull: false, defaultValue: 'active' },
      ...timestamps(S),
    }),
  },
  transactions: {
    table: 'Transaction',
    up: (qi, S) => createTableIfMissing(qi, S, 'Transaction', {
      id: bigId(S),
      wallet_id: ref(S, 'Wallet'),
      user_id: ref(S, 'User'),
      type: { type: S.ENUM('credit', 'debit', 'refund', 'adjustment'), allowNull: false },
      amount: { type: S.DECIMAL(12, 2), allowNull: false },
      currency: { type: S.STRING(8), allowNull: false, defaultValue: 'USD' },
      status: { type: S.ENUM('pending', 'completed', 'failed', 'reversed'), allowNull: false, defaultValue: 'pending' },
      reference: { type: S.STRING(190), allowNull: true },
      metadata: { type: S.JSONB, allowNull: false, defaultValue: {} },
      ...timestamps(S),
    }),
  },
  locationHistories: {
    table: 'LocationHistory',
    up: (qi, S) => createTableIfMissing(qi, S, 'LocationHistory', {
      id: bigId(S),
      driver_id: ref(S, 'Driver', true),
      ride_id: ref(S, 'Ride', true),
      lat: { type: S.DECIMAL(10, 7), allowNull: false },
      lng: { type: S.DECIMAL(10, 7), allowNull: false },
      recorded_at: { type: S.DATE, allowNull: false, defaultValue: S.literal('CURRENT_TIMESTAMP') },
      ...timestamps(S),
    }),
  },
  deviceInfos: {
    table: 'DeviceInfo',
    up: (qi, S) => createTableIfMissing(qi, S, 'DeviceInfo', {
      id: bigId(S),
      user_id: ref(S, 'User'),
      platform: { type: S.STRING(40), allowNull: false },
      device_token: { type: S.STRING(255), allowNull: true },
      app_version: { type: S.STRING(40), allowNull: true },
      os_version: { type: S.STRING(80), allowNull: true },
      last_seen_at: { type: S.DATE, allowNull: true },
      metadata: { type: S.JSONB, allowNull: false, defaultValue: {} },
      ...timestamps(S),
    }),
  },
  settings: {
    table: 'Settings',
    up: (qi, S) => createTableIfMissing(qi, S, 'Settings', {
      id: bigId(S),
      key: { type: S.STRING(120), allowNull: false, unique: true },
      value: { type: S.JSONB, allowNull: false, defaultValue: {} },
      description: { type: S.TEXT, allowNull: true },
      is_public: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(S),
    }),
  },
  indexes: {
    up: async (qi) => {
      await addIndexIfMissing(qi, 'User', ['email'], { unique: true });
      await addIndexIfMissing(qi, 'Driver', ['user_id'], { unique: true });
      await addIndexIfMissing(qi, 'Ride', ['status']);
      await addIndexIfMissing(qi, 'Ride', ['rider_id', 'created_at']);
      await addIndexIfMissing(qi, 'Payment', ['status']);
      await addIndexIfMissing(qi, 'Payment', ['provider_ref']);
      await addIndexIfMissing(qi, 'mobile_money_transactions', ['transaction_id'], { unique: true });
      await addIndexIfMissing(qi, 'payment_webhook_logs', ['provider']);
    },
    down: async () => {},
  },
  foreignKeys: {
    up: async (qi) => {
      await addConstraintIfMissing(qi, 'Driver', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_driver_user_id',
        references: { table: 'User', field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });
    },
    down: async () => {},
  },
  triggers: {
    up: (qi) => qi.sequelize.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `),
    down: (qi) => qi.sequelize.query('DROP FUNCTION IF EXISTS set_updated_at() CASCADE;'),
  },
  views: {
    up: (qi) => qi.sequelize.query(`
      CREATE OR REPLACE VIEW ride_summary AS
      SELECT r.id, r.status, r.fare_amount, r.created_at, u.email AS rider_email
      FROM "Ride" r
      LEFT JOIN "User" u ON u.id = r.rider_id;
    `),
    down: (qi) => qi.sequelize.query('DROP VIEW IF EXISTS ride_summary;'),
  },
  materializedViews: {
    up: (qi) => qi.sequelize.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS daily_revenue_summary AS
      SELECT DATE_TRUNC('day', created_at) AS day, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS payment_count
      FROM "Payment"
      WHERE status = 'succeeded'
      GROUP BY DATE_TRUNC('day', created_at);
    `),
    down: (qi) => qi.sequelize.query('DROP MATERIALIZED VIEW IF EXISTS daily_revenue_summary;'),
  },
};

const dropOrder = [
  'daily_revenue_summary',
  'ride_summary',
  'Settings',
  'DeviceInfo',
  'LocationHistory',
  'Transaction',
  'Wallet',
  'Referral',
  'InviteCode',
  'RefreshToken',
  'Session',
  'Permission',
  'Role',
  'Report',
  'Webhook',
  'Notification',
  'AuditLog',
  'SupportTicket',
  'Review',
  'Incident',
  'Vehicle',
  'Zone',
  'Promotion',
  'Payment',
  'Ride',
  'Driver',
  'User',
];

const up = (name) => async (queryInterface, Sequelize) => migrations[name].up(queryInterface, Sequelize);

const down = (name) => async (queryInterface) => {
  const migration = migrations[name];
  if (migration.down) {
    await migration.down(queryInterface);
    return;
  }
  if (migration.table) {
    await dropTableIfExists(queryInterface, migration.table);
  }
};

module.exports = { up, down, dropOrder };
