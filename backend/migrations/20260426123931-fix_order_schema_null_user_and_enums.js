'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper to find the correct table name (Order or Orders)
    const tables = await queryInterface.showAllTables();
    const tableName = tables.find(t => ['Order', 'Orders'].includes(t)) || 'Order';
    
    console.log(`🚀 Fixing Order schema on table: ${tableName}`);

    // 1. Change userId to be nullable (Crucial for Marketing Orders)
    try {
      // For MySQL, we might need to drop the FK before changing nullability
      if (dialect === 'mysql' || dialect === 'mariadb') {
        try {
          // Attempt to drop the specific constraint mentioned in the error
          await queryInterface.sequelize.query('ALTER TABLE `' + tableName + '` DROP FOREIGN KEY `Order_ibfk_61`');
          console.log('✅ Dropped foreign key Order_ibfk_61');
        } catch (fkErr) {
          console.log('ℹ️ Order_ibfk_61 not found or already dropped');
        }
      }

      await queryInterface.changeColumn(tableName, 'userId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'User',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
      console.log('✅ Made userId nullable');
    } catch (err) {
      console.warn('⚠️ Could not change userId column:', err.message);
    }

    // 2. Ensure adminRoutingStrategy ENUM is up to date (MySQL only)
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`adminRoutingStrategy\` ENUM('warehouse', 'pick_station', 'direct_delivery', 'fastfood_pickup_point') NULL`
        );
        console.log('✅ Updated adminRoutingStrategy ENUM values');
      } catch (err) {
        console.warn('⚠️ Could not update adminRoutingStrategy ENUM:', err.message);
      }
      
      // Update paymentSubType ENUM if needed
      try {
        await queryInterface.sequelize.query(
          `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`paymentSubType\` ENUM('cash', 'mpesa', 'bank_transfer', 'paypal', 'mpesa_prepay', 'airtel_money_prepay', 'bank_transfer_prepay', 'lipa_mdogo_mdogo') NULL`
        );
        console.log('✅ Updated paymentSubType ENUM values');
      } catch (err) {
        console.warn('⚠️ Could not update paymentSubType ENUM:', err.message);
      }
    }

    // 3. Ensure other new columns exist (Safety sync)
    const tableDesc = await queryInterface.describeTable(tableName);
    
    const columnsToAdd = {
      isMarketingOrder: { type: Sequelize.BOOLEAN, defaultValue: false },
      paymentProofUrl: { type: Sequelize.STRING, allowNull: true },
      batchId: { type: Sequelize.INTEGER, allowNull: true },
      marketerId: { type: Sequelize.INTEGER, allowNull: true },
      totalBasePrice: { type: Sequelize.FLOAT, defaultValue: 0 }
    };

    for (const [col, spec] of Object.entries(columnsToAdd)) {
      if (!tableDesc[col]) {
        try {
          await queryInterface.addColumn(tableName, col, spec);
          console.log(`✅ Added missing column: ${col}`);
        } catch (err) {
          console.warn(`⚠️ Could not add column ${col}:`, err.message);
        }
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Reverting nullable userId is usually not necessary and can be destructive
  }
};
