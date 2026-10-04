const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define('Ride', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rider_id: { type: DataTypes.UUID, allowNull: false },
    driver_id: { type: DataTypes.UUID, allowNull: true },
    pickup_address: { type: DataTypes.STRING(255), allowNull: false },
    dropoff_address: { type: DataTypes.STRING(255), allowNull: false },
    pickup_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    pickup_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    dropoff_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    dropoff_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    status: {
      type: DataTypes.ENUM('requested', 'searching', 'accepted', 'arrived', 'picked_up', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'requested',
    },
    distance_km: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    fare_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  });
