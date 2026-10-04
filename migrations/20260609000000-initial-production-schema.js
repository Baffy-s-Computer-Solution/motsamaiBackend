'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Users Table
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, unique: true, allowNull: false },
      phone: { type: Sequelize.STRING, unique: true, allowNull: false },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.ENUM('rider', 'driver', 'admin'), defaultValue: 'rider' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 2. Drivers Table
    await queryInterface.createTable('drivers', {
      id: { type: Sequelize.UUID, primaryKey: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      license_number: { type: Sequelize.STRING, unique: true, allowNull: false },
      is_online: { type: Sequelize.BOOLEAN, defaultValue: false },
      rating: { type: Sequelize.DECIMAL(3, 2), defaultValue: 5.0 },
      last_location_update: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 3. Rides Table
    await queryInterface.createTable('rides', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      rider_id: { type: Sequelize.UUID, references: { model: 'users', key: 'id' }, allowNull: false },
      driver_id: { type: Sequelize.UUID, references: { model: 'drivers', key: 'id' }, allowNull: true },
      pickup_location: { type: Sequelize.GEOMETRY('POINT'), allowNull: false },
      dropoff_location: { type: Sequelize.GEOMETRY('POINT'), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'accepted', 'ongoing', 'completed', 'cancelled'), defaultValue: 'pending' },
      fare: { type: Sequelize.DECIMAL(10, 2) },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 4. Payments Table
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      ride_id: { type: Sequelize.UUID, references: { model: 'rides', key: 'id' }, allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      provider: { type: Sequelize.ENUM('MPESA', 'ECOCASH'), allowNull: false },
      status: { type: Sequelize.ENUM('PENDING', 'COMPLETED', 'FAILED'), defaultValue: 'PENDING' },
      transaction_id: { type: Sequelize.STRING, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // Add Spatial Indexing for location-based queries
    await queryInterface.addIndex('rides', ['pickup_location'], { type: 'SPATIAL' });
    await queryInterface.addIndex('rides', ['status', 'created_at']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('rides');
    await queryInterface.dropTable('drivers');
    await queryInterface.dropTable('users');
  }
};