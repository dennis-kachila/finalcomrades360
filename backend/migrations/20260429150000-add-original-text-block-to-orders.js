'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Order', 'originalTextBlock', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Original text block used to create this direct order'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Order', 'originalTextBlock');
  }
};
