const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentReconciliation = sequelize.define('PaymentReconciliation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Payment',
        key: 'id'
      }
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Order',
        key: 'id'
      }
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'External transaction ID (e.g., M-Pesa receipt)'
    },
    expectedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Expected payment amount'
    },
    actualAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Actual amount received'
    },
    discrepancyType: {
      type: DataTypes.ENUM(
        'overpayment',
        'underpayment',
        'orphaned_payment',  // Payment with no matching order
        'duplicate',
        'reversed',
        'mismatch',
        'resolved'
      ),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'investigating', 'resolved', 'escalated'),
      defaultValue: 'pending'
    },
    notes: {
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
    resolutionAction: {
      type: DataTypes.ENUM('refund_issued', 'partial_refund', 'credit_wallet', 'manual_adjustment', 'accepted_as_is'),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional investigation data'
    }
  }, {
    tableName: 'PaymentReconciliations',
    timestamps: true,
    indexes: [
      { fields: ['paymentId'] },
      { fields: ['orderId'] },
      { fields: ['transactionId'] },
      { fields: ['discrepancyType'] },
      { fields: ['status'] }
    ]
  });

  return PaymentReconciliation;
};
