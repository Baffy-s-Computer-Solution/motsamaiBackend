const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define('Payment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ride_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.ENUM('stripe', 'cash', 'wallet', 'mpesa', 'ecocash', 'MPESA', 'ECOCASH'), defaultValue: 'stripe' },
    provider_ref: { type: DataTypes.STRING(190), allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'USD' },
    status: { type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'refunded'), defaultValue: 'pending' },
    metadata: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
  }, {
    tableName: 'payments',
  });
