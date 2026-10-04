'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('drivers', 'current_location', {
      type: Sequelize.GEOMETRY('POINT'),
      allowNull: true
    });

    // Add a spatial index for location-based searching
    await queryInterface.addIndex('drivers', ['current_location'], {
      type: 'SPATIAL',
      name: 'drivers_location_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('drivers', 'drivers_location_idx');
    await queryInterface.removeColumn('drivers', 'current_location');
  }
};