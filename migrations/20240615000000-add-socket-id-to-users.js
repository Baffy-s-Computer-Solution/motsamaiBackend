'use strict';

/**
 * Migration to add socket_id to the users table for real-time tracking.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'socket_id', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Stores the current active socket connection ID for targeted push notifications'
    });

    // Adding an index for high-speed lookups when sending notifications
    await queryInterface.addIndex('users', ['socket_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('users', ['socket_id']);
    await queryInterface.removeColumn('users', 'socket_id');
  }
};