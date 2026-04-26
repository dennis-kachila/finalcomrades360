'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add isVerified to Otps table
    try {
      const tableInfo = await queryInterface.describeTable('Otps');
      if (!tableInfo.isVerified) {
        await queryInterface.addColumn('Otps', 'isVerified', {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          allowNull: false
        });
        console.log('✅ Added isVerified column to Otps table');
      }
    } catch (e) {
      console.log('ℹ️ Otps table might not exist yet or column already exists');
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Otps', 'isVerified');
  }
};
