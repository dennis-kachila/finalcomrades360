const { Sequelize } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('PlatformConfig');
    if (!tableInfo.returnPeriod) {
      await queryInterface.addColumn('PlatformConfig', 'returnPeriod', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('PlatformConfig', 'returnPeriod');
  },
};