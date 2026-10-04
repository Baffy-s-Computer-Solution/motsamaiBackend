/**
 * Centralized models registry
 * Exposes `sequelize` and initialized models in a single export
 */

const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const extraModels = require('./extraModels');

// Initialize models (files export factory functions)
const User = require('./User')(sequelize, DataTypes);
const Driver = require('./Driver')(sequelize, DataTypes);
const Ride = require('./Ride')(sequelize, DataTypes);
const Payment = require('./Payment')(sequelize, DataTypes);
const Review = require('./Review')(sequelize, DataTypes);
const Promotion = require('./Promotion')(sequelize, DataTypes);
let PromotionUsage = null;
try { PromotionUsage = require('./promotionUsage.model')(sequelize); } catch (e) { /* optional */ }
const Zone = require('./Zone')(sequelize, DataTypes);
const Vehicle = require('./Vehicle')(sequelize, DataTypes);
const Incident = require('./Incident')(sequelize, DataTypes);
const SupportTicket = require('./SupportTicket')(sequelize, DataTypes);
const AuditLog = require('./AuditLog')(sequelize, DataTypes);
const Notification = require('./Notification')(sequelize, DataTypes);
const RefreshToken = require('./RefreshToken')(sequelize, DataTypes);
const Settings = require('./Settings')(sequelize, DataTypes);
const Document = extraModels.Document(sequelize, DataTypes);
const DriverStatus = extraModels.DriverStatus(sequelize, DataTypes);
const DriverLocation = extraModels.DriverLocation(sequelize, DataTypes);
const Payout = extraModels.Payout(sequelize, DataTypes);
let Wallet = null; try { Wallet = require('./Wallet')(sequelize); } catch (e) { /* optional */ }
let Transaction = null; try { Transaction = require('./Transaction')(sequelize); } catch (e) { /* optional */ }

// Safe, minimal associations used by tests
try {
  if (User && Driver) {
    User.hasOne(Driver, { foreignKey: 'user_id', as: 'driverProfile' });
    Driver.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  }

  if (Driver && Vehicle) {
    Driver.hasMany(Vehicle, { foreignKey: 'driver_id' });
    Vehicle.belongsTo(Driver, { foreignKey: 'driver_id' });
  }

  if (Ride && User) {
    Ride.belongsTo(User, { foreignKey: 'rider_id', as: 'rider' });
  }

  if (Ride && Driver) {
    Ride.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
  }

  if (Ride && Payment) {
    Ride.hasOne(Payment, { foreignKey: 'ride_id', as: 'payment' });
    Payment.belongsTo(Ride, { foreignKey: 'ride_id', as: 'ride' });
  }

  if (User && Wallet) {
    User.hasOne(Wallet, { as: 'wallet', foreignKey: 'user_id' });
    Wallet.belongsTo(User, { as: 'user', foreignKey: 'user_id' });
  }

  if (Wallet && Transaction) {
    Wallet.hasMany(Transaction, { as: 'transactions', foreignKey: 'wallet_id' });
    Transaction.belongsTo(Wallet, { as: 'wallet', foreignKey: 'wallet_id' });
  }
} catch (err) {
  logger.debug('Model association warning:', err && err.message ? err.message : err);
}

logger.info('✅ Models initialized');

module.exports = {
  sequelize,
  User,
  Driver,
  Ride,
  Payment,
  Review,
  Promotion,
  PromotionUsage,
  Zone,
  Vehicle,
  Incident,
  SupportTicket,
  AuditLog,
  Notification,
  RefreshToken,
  Wallet,
  Transaction,
  Document,
  DriverStatus,
  DriverLocation,
  Payout,
};