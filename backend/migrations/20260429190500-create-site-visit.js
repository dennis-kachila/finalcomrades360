'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('SiteVisit', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      ipAddress: {
        type: Sequelize.STRING
      },
      userAgent: {
        type: Sequelize.TEXT
      },
      path: {
        type: Sequelize.STRING,
        allowNull: false
      },
      referrer: {
        type: Sequelize.STRING
      },
      sessionId: {
        type: Sequelize.STRING
      },
      deviceType: {
        type: Sequelize.STRING
      },
      browser: {
        type: Sequelize.STRING
      },
      os: {
        type: Sequelize.STRING
      },
      location: {
        type: Sequelize.STRING
      },
      isUnique: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('SiteVisit', ['createdAt']);
    await queryInterface.addIndex('SiteVisit', ['path']);
    await queryInterface.addIndex('SiteVisit', ['sessionId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('SiteVisit');
  }
};
