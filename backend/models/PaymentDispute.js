const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentDispute = sequelize.define('PaymentDispute', {
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
      },
      comment: 'Customer who raised the dispute'
    },
    disputeType: {
      type: DataTypes.ENUM(
        'unauthorized_charge',
        'double_charge',
        'wrong_amount',
        'service_not_received',
        'product_not_received',
        'defective_product',
        'other'
      ),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Detailed dispute description from customer'
    },
    status: {
      type: DataTypes.ENUM('open', 'investigating', 'awaiting_customer', 'awaiting_seller', 'resolved', 'closed'),
      defaultValue: 'open'
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium'
    },
    assignedTo: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      },
      comment: 'Admin assigned to handle the dispute'
    },
    resolution: {
      type: DataTypes.ENUM('refund', 'partial_refund', 'replacement', 'credit', 'no_action', 'escalated'),
      allowNull: true
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resolvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    evidence: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Attached documents/screenshots URLs'
    },
    timeline: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Dispute activity timeline'
    }
  }, {
    tableName: 'PaymentDisputes',
    timestamps: true,
    indexes: [
      { fields: ['paymentId'] },
      { fields: ['orderId'] },
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['assignedTo'] }
    ]
  });

  PaymentDispute.associate = (models) => {
    PaymentDispute.belongsTo(models.Payment, { foreignKey: 'paymentId', as: 'payment' });
    PaymentDispute.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
    PaymentDispute.belongsTo(models.User, { foreignKey: 'userId', as: 'customer' });
    PaymentDispute.belongsTo(models.User, { foreignKey: 'assignedTo', as: 'assignee' });
    PaymentDispute.belongsTo(models.User, { foreignKey: 'resolvedBy', as: 'resolver' });
  };

  return PaymentDispute;
};
