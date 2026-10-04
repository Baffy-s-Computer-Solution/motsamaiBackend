'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false
      },
      resource: {
        type: Sequelize.STRING,
        allowNull: true
      },
      resource_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING,
        allowNull: true
      },
      user_agent: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('audit_logs', ['user_id', 'action', 'created_at']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('audit_logs');
  }
};