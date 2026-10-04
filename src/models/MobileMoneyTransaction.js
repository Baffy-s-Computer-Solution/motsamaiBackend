/**
 * Mobile Money Transaction Model
 * Stores M-Pesa and EcoCash transactions
 * @module models/MobileMoneyTransaction
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MobileMoneyTransaction = sequelize.define('MobileMoneyTransaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transactionId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    index: true
  },
  provider: {
    type: DataTypes.ENUM('MPESA', 'ECOCASH'),
    allowNull: false,
    index: true
  },
  providerTransactionId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    index: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    index: true,
    references: {
      model: 'User',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0.01
    }
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'LSL',
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    index: true
  },
  type: {
    type: DataTypes.ENUM('C2B', 'B2C', 'B2B', 'REFUND', 'REVERSAL'),
    defaultValue: 'C2B'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED', 'TIMEOUT'),
    defaultValue: 'PENDING',
    index: true
  },
  providerStatus: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  error: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  idempotencyKey: {
    type: DataTypes.STRING(200),
    unique: true,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'mobile_money_transactions',
  timestamps: true,
  indexes: [
    {
      fields: ['transaction_id'],
      unique: true
    },
    {
      fields: ['provider', 'status']
    },
    {
      fields: ['user_id', 'created_at']
    },
    {
      fields: ['phone_number', 'provider']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = MobileMoneyTransaction;