'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // For SQLite, we must recreate the table to properly drop Foreign Key constraints
    // since ALTER TABLE DROP CONSTRAINT is not supported.

    const dialect = queryInterface.sequelize.getDialect();
    const isSQLite = dialect === 'sqlite';
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Disable FK checks for this session
      if (isSQLite) {
        await queryInterface.sequelize.query('PRAGMA foreign_keys = OFF', { transaction });
      } else {
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      }

      // 2. Rename the current table
      await queryInterface.renameTable('HandoverCode', 'HandoverCode_old', { transaction });

      // 3. Create the new table without the FK constraints on IDs
      await queryInterface.createTable('HandoverCode', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER
        },
        code: {
            type: Sequelize.STRING(5),
            allowNull: false
        },
        orderId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'Order', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE'
        },
        taskId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'DeliveryTask', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        },
        handoverType: {
            type: Sequelize.STRING,
            allowNull: false
        },
        initiatorId: {
            type: Sequelize.STRING, 
            allowNull: false
        },
        confirmerId: {
            type: Sequelize.STRING, 
            allowNull: true
        },
        status: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'pending'
        },
        expiresAt: {
            type: Sequelize.DATE,
            allowNull: false
        },
        confirmedAt: {
            type: Sequelize.DATE,
            allowNull: true
        },
        notes: {
            type: Sequelize.TEXT,
            allowNull: true
        },
        createdAt: {
            allowNull: false,
            type: Sequelize.DATE
        },
        updatedAt: {
            allowNull: false,
            type: Sequelize.DATE
        }
      }, { transaction });

      // 4. Copy data with dialect-specific cast
      const castType = isSQLite ? 'TEXT' : 'CHAR';
      await queryInterface.sequelize.query(`
        INSERT INTO HandoverCode (id, code, orderId, taskId, handoverType, initiatorId, confirmerId, status, expiresAt, confirmedAt, notes, createdAt, updatedAt)
        SELECT id, code, orderId, taskId, handoverType, CAST(initiatorId AS ${castType}), CAST(confirmerId AS ${castType}), status, expiresAt, confirmedAt, notes, createdAt, updatedAt
        FROM HandoverCode_old
      `, { transaction });

      // 5. Drop the old table
      await queryInterface.dropTable('HandoverCode_old', { transaction });

      // 6. Re-add indexes
      await queryInterface.addIndex('HandoverCode', ['code', 'orderId', 'handoverType', 'status'], { transaction });
      await queryInterface.addIndex('HandoverCode', ['orderId', 'handoverType', 'status'], { transaction });
      await queryInterface.addIndex('HandoverCode', ['initiatorId'], { transaction });
      await queryInterface.addIndex('HandoverCode', ['expiresAt'], { transaction });

      // 7. Re-enable FK checks
      if (isSQLite) {
        await queryInterface.sequelize.query('PRAGMA foreign_keys = ON', { transaction });
      } else {
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      }

      await transaction.commit();
      console.log('[Migration] HandoverCode table successfully recreated and dialect-aware.');
    } catch (err) {
      await transaction.rollback();
      console.error('[Migration Error] Failed to recreate HandoverCode table:', err.message);
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Standard down migration logic would go here if needed to revert to the exact original state.
    // For now, we skip as this is a fix migration.
  }
};
