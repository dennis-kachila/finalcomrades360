'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'User';
    const tableDefinition = await queryInterface.describeTable(tableName);

    if (!tableDefinition.suspendedRoles) {
      await queryInterface.addColumn(tableName, 'suspendedRoles', {
        type: Sequelize.JSON,
        defaultValue: [],
        allowNull: true
      });
    }

    if (!tableDefinition.isMarketerSuspended) {
      await queryInterface.addColumn(tableName, 'isMarketerSuspended', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!tableDefinition.isSellerSuspended) {
      await queryInterface.addColumn(tableName, 'isSellerSuspended', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!tableDefinition.isDeliverySuspended) {
      await queryInterface.addColumn(tableName, 'isDeliverySuspended', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!tableDefinition.mustChangePassword) {
      await queryInterface.addColumn(tableName, 'mustChangePassword', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableName = 'User';
    const tableDefinition = await queryInterface.describeTable(tableName);

    if (tableDefinition.suspendedRoles) {
      await queryInterface.removeColumn(tableName, 'suspendedRoles');
    }
    if (tableDefinition.isMarketerSuspended) {
      await queryInterface.removeColumn(tableName, 'isMarketerSuspended');
    }
    if (tableDefinition.isSellerSuspended) {
      await queryInterface.removeColumn(tableName, 'isSellerSuspended');
    }
    if (tableDefinition.isDeliverySuspended) {
      await queryInterface.removeColumn(tableName, 'isDeliverySuspended');
    }
    if (tableDefinition.mustChangePassword) {
      await queryInterface.removeColumn(tableName, 'mustChangePassword');
    }
  }
};
