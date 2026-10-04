/**
 * User Model - Production Ready
 * @param {Sequelize} sequelize - Sequelize instance
 * @param {DataTypes} DataTypes - Sequelize data types
 * @returns {Model} User model
 */

const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true,
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 50],
      },
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 50],
      },
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [6, 255],
      },
    },
    role: {
      type: DataTypes.ENUM('rider', 'driver', 'admin', 'support', 'fleet_owner'),
      defaultValue: 'rider',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verification_status: {
      type: DataTypes.ENUM('not_started', 'pending', 'in_review', 'approved', 'rejected', 'expired'),
      defaultValue: 'not_started',
    },
    verification_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    verification_submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verification_reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verification_review_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reference_selfie_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    biometric_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    biometric_last_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    biometric_failed_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    biometric_locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    device_fingerprints: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    last_known_location: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    verification_documents: {
      type: DataTypes.JSONB,
      defaultValue: {
        nationalId: null,
        driverLicense: null,
        vehicleRegistration: null,
        vehiclePhotos: [],
      },
    },
    vehicle_info: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    document_expirations: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    next_reverification_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    phone_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    profile_picture: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        language: 'en',
        currency: 'USD',
        notifications: true,
        emailUpdates: true,
      },
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    firebase_uid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    device_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    paranoid: true, // Soft deletes
    indexes: [
      { fields: ['email'] },
      { fields: ['phone'] },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['verification_status'] },
      { fields: ['biometric_locked_until'] },
      { fields: ['next_reverification_at'] },
      { fields: ['created_at'] },
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password_hash) {
          const salt = await bcrypt.genSalt(12);
          user.password_hash = await bcrypt.hash(user.password_hash, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password_hash')) {
          const salt = await bcrypt.genSalt(12);
          user.password_hash = await bcrypt.hash(user.password_hash, salt);
        }
      },
    },
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    if (!password || !this.password_hash) return false;
    return bcrypt.compare(password, this.password_hash);
  };

  User.prototype.getFullName = function() {
    return `${this.first_name} ${this.last_name}`;
  };

  User.prototype.requiresBiometricLogin = function() {
    return this.role === 'driver' && this.biometric_enabled && Boolean(this.reference_selfie_key);
  };

  User.prototype.isBiometricLocked = function() {
    return Boolean(this.biometric_locked_until && new Date(this.biometric_locked_until) > new Date());
  };

  User.prototype.requiresReverification = function() {
    return this.role === 'driver' && Boolean(this.next_reverification_at && new Date(this.next_reverification_at) <= new Date());
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password_hash;
    delete values.firebase_uid;
    delete values.device_token;
    delete values.reference_selfie_key;
    return values;
  };

  // Static methods
  User.findByEmail = function(email) {
    return this.findOne({ where: { email } });
  };

  User.findByPhone = function(phone) {
    return this.findOne({ where: { phone } });
  };

  User.findActive = function() {
    return this.findAll({ where: { is_active: true } });
  };

  return User;
};
