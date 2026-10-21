const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('RiderRecord', {
  id: { type: DataTypes.UUID, primaryKey: true },
  firebase_uid: { type: DataTypes.STRING(128), allowNull: false },
  record_type: { type: DataTypes.STRING(48), allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'active' },
  payload: { type: DataTypes.JSONB, allowNull: false },
  sync_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
  source_updated_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'rider_records',
  timestamps: true,
  underscored: true,
});
