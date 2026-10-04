const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    const table = await queryInterface.describeTable('payments');
    if (!table.metadata) {
      await queryInterface.addColumn('payments', 'metadata', {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      });
    }
    if (table.ride_id && table.ride_id.allowNull === false) {
      await queryInterface.changeColumn('payments', 'ride_id', {
        type: DataTypes.UUID,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('payments');
    if (table.metadata) await queryInterface.removeColumn('payments', 'metadata');
  }
};
