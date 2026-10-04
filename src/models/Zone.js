const { DataTypes } = require('sequelize');
module.exports = (sequelize) =>
  sequelize.define('Zone', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    city: { type: DataTypes.STRING(120), allowNull: false },
    base_fare: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1.5 },
    per_km_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1.0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  });
