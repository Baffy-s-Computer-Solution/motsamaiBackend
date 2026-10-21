'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('rider_records', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      firebase_uid: { type: Sequelize.STRING(128), allowNull: false },
      record_type: { type: Sequelize.STRING(48), allowNull: false },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'active' },
      payload: { type: Sequelize.JSONB, allowNull: false },
      sync_status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
      source_updated_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('rider_records', ['firebase_uid', 'record_type', 'created_at'], {
      name: 'rider_records_owner_type_created_idx',
    });
    await queryInterface.addIndex('rider_records', ['sync_status', 'source_updated_at'], {
      name: 'rider_records_sync_pending_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('rider_records');
  },
};
