'use strict';

const tableExists = async (queryInterface, tableName) => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

const addColumnIfMissing = async (queryInterface, Sequelize, tableName, columnName, definition) => {
  if (!(await tableExists(queryInterface, tableName))) return;
  const columns = await queryInterface.describeTable(tableName);
  if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'notifications'))) {
      await queryInterface.createTable('notifications', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        user_id: { type: Sequelize.UUID, allowNull: false },
        channel: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'in_app' },
        title: { type: Sequelize.STRING(160), allowNull: false },
        body: { type: Sequelize.TEXT, allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'pending' },
        metadata: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        sent_at: { type: Sequelize.DATE, allowNull: true },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }

    for (const tableName of ['users', 'User']) {
      await addColumnIfMissing(queryInterface, Sequelize, tableName, 'metadata', {
        type: Sequelize.JSONB, allowNull: false, defaultValue: {},
      });
    }
    for (const tableName of ['payments', 'Payment']) {
      await addColumnIfMissing(queryInterface, Sequelize, tableName, 'metadata', {
        type: Sequelize.JSONB, allowNull: true, defaultValue: {},
      });
      await addColumnIfMissing(queryInterface, Sequelize, tableName, 'provider_ref', {
        type: Sequelize.STRING(190), allowNull: true,
      });
      await addColumnIfMissing(queryInterface, Sequelize, tableName, 'user_id', {
        type: Sequelize.UUID, allowNull: true,
      });
      await addColumnIfMissing(queryInterface, Sequelize, tableName, 'currency', {
        type: Sequelize.STRING(8), allowNull: false, defaultValue: 'USD',
      });
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'notifications')) await queryInterface.dropTable('notifications');
  },
};
