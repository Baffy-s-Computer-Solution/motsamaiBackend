'use strict';

/**
 * Migration to create the zones table with PostGIS geometry support for geofencing.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Ensure the PostGIS extension is enabled in the PostgreSQL database
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');

    await queryInterface.createTable('zones', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      base_fare: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00,
        comment: 'Base fare applied when a ride originates in this zone'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      // PostGIS Polygon column using SRID 4326 (WGS 84 / GPS coordinates)
      boundary: {
        type: Sequelize.GEOMETRY('POLYGON', 4326),
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Add a spatial GIST index to allow fast ST_Contains queries
    await queryInterface.addIndex('zones', ['boundary'], { type: 'SPATIAL' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('zones');
  }
};