const { DataTypes } = require('sequelize');
module.exports = (sequelize) =>
  sequelize.define('Promotion', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    discount_type: { type: DataTypes.ENUM('fixed', 'percent'), allowNull: false, defaultValue: 'percent' },
    discount_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
  });
