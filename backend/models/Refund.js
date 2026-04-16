const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Refund = sequelize.define('Refund', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Payment',
        key: 'id'
      }
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Order',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Refund amount (may be partial)'
    },
    originalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Original payment amount'
    },
    refundType: {
      type: DataTypes.ENUM('full', 'partial'),
      defaultValue: 'full'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Reason for refund request'
    },
    status: {
      type: DataTypes.ENUM('requested', 'approved', 'processing', 'completed', 'rejected', 'failed'),
      defaultValue: 'requested'
    },
    method: {
      type: DataTypes.ENUM('original_payment_method', 'wallet_credit', 'manual_transfer'),
      defaultValue: 'original_payment_method'
    },
    externalRefundId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'M-Pesa or payment gateway refund ID'
    },
    requestedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      },
      comment: 'User who requested the refund (customer or admin)'
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    processedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'Refunds',
    timestamps: true,
    indexes: [
      { fields: ['paymentId'] },
      { fields: ['orderId'] },
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['requestedBy'] }
    ]
  });

  Refund.associate = (models) => {
    Refund.belongsTo(models.Payment, { foreignKey: 'paymentId', as: 'payment' });
    Refund.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
    Refund.belongsTo(models.User, { foreignKey: 'userId', as: 'customer' });
    Refund.belongsTo(models.User, { foreignKey: 'requestedBy', as: 'requester' });
    Refund.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
    Refund.belongsTo(models.User, { foreignKey: 'processedBy', as: 'processor' });
  };

  return Refund;
};
