const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentRetryQueue = sequelize.define('PaymentRetryQueue', {
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
    retryCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of retry attempts made'
    },
    maxRetries: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: 'Maximum retry attempts allowed'
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Next scheduled retry timestamp'
    },
    status: {
      type: DataTypes.ENUM('pending', 'retrying', 'completed', 'exhausted', 'cancelled'),
      defaultValue: 'pending'
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for payment failure'
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastAttemptError: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Original payment request data for retry'
    }
  }, {
    tableName: 'PaymentRetryQueues',
    timestamps: true,
    indexes: [
      { fields: ['paymentId'] },
      { fields: ['status'] },
      { fields: ['nextRetryAt'] }
    ]
  });

  PaymentRetryQueue.associate = (models) => {
    PaymentRetryQueue.belongsTo(models.Payment, { foreignKey: 'paymentId', as: 'payment' });
    PaymentRetryQueue.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
  };

  return PaymentRetryQueue;
};
