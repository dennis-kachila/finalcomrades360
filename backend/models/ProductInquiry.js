const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductInquiry extends Model {}

  ProductInquiry.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Product',
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
    subject: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'resolved', 'closed'),
      defaultValue: 'pending'
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
      }
    },
    response: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    respondedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Additional metadata
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    sessionId: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'ProductInquiry',
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        fields: ['productId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['assignedTo']
      },
      {
        fields: ['createdAt']
      }
    ]
  });

  // Define associations
  ProductInquiry.associate = function(models) {
    // Temporarily comment out Product association until Product model is available
    ProductInquiry.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'Product'
    });

    ProductInquiry.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'Customer'
    });

    ProductInquiry.belongsTo(models.User, {
      foreignKey: 'assignedTo',
      as: 'AssignedAdmin'
    });
    ProductInquiry.hasMany(models.ProductInquiryReply, {
      foreignKey: 'productInquiryId',
      as: 'replies'
    });
  };

  return ProductInquiry;
};