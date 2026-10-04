'use strict';

/**
 * Migration to add an explicit unique constraint to the zone name field.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Adding a unique constraint ensures data integrity at the database level
    await queryInterface.addConstraint('zones', {
      fields: ['name'],
      type: 'unique',
      name: 'unique_zone_name_constraint'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback: Remove the constraint
    await queryInterface.removeConstraint('zones', 'unique_zone_name_constraint');
  }
};