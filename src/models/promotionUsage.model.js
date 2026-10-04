const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PromotionUsage = sequelize.define('PromotionUsage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    promotion_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Promotion',
        key: 'id',
      },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id',
      },
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'Ride',
        key: 'id',
      },
    },
    discount_applied: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'PromotionUsages',
    timestamps: false,
  });

  return PromotionUsage;
};