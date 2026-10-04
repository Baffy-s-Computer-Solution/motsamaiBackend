const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define('Driver', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    license_number: { type: DataTypes.STRING(64), allowNull: false },
    verification_status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending',
    },
    rating: { type: DataTypes.DECIMAL(3, 2), defaultValue: 5.0 },
    is_online: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.ENUM('available', 'busy', 'offline', 'suspended'), defaultValue: 'offline' },
    current_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    current_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  });
