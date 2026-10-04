const { DataTypes } = require('sequelize');
module.exports = (sequelize) =>
  sequelize.define('PaymentWebhookLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    provider: {
      type: DataTypes.ENUM('MPESA', 'ECOCASH'),
      allowNull: false
    },
    webhookType: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    processingTime: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'payment_webhook_logs',
    timestamps: true,
    indexes: [
      { fields: ['provider'] },
      { fields: ['webhook_type'] },
      { fields: ['received_at'] }
    ]
  });
