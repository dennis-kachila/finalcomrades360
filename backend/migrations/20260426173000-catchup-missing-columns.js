'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Transaction Table Missing Columns
    try {
      const txTable = await queryInterface.describeTable('Transaction');
      
      if (!txTable.fee) {
        await queryInterface.addColumn('Transaction', 'fee', {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0
        });
        console.log('✅ Added fee to Transaction table');
      }

      if (!txTable.metadata) {
        await queryInterface.addColumn('Transaction', 'metadata', {
          type: Sequelize.TEXT,
          allowNull: true
        });
        console.log('✅ Added metadata to Transaction table');
      }
    } catch (e) {
      console.log('ℹ️ Transaction table missing column check skipped:', e.message);
    }

    // 2. HandoverCode Table Missing Columns
    try {
      const hcTable = await queryInterface.describeTable('HandoverCode');
      
      if (!hcTable.autoConfirmAt) {
        await queryInterface.addColumn('HandoverCode', 'autoConfirmAt', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('✅ Added autoConfirmAt to HandoverCode table');
      }
    } catch (e) {
      console.log('ℹ️ HandoverCode table missing column check skipped:', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeColumn('Transaction', 'fee');
      await queryInterface.removeColumn('Transaction', 'metadata');
      await queryInterface.removeColumn('HandoverCode', 'autoConfirmAt');
    } catch (e) {
      console.log('Down migration skipped for missing columns');
    }
  }
};
