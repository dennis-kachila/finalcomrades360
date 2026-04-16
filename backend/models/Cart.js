const { DataTypes, Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Cart extends Model { }

  Cart.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Product',
        key: 'id'
      }
    },
    fastFoodId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'FastFoods',
        key: 'id'
      }
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Services',
        key: 'id'
      }
    },
    itemType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'product'
    },
    variantId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Identifier for size variant (e.g. "Large")'
    },
    comboId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Identifier for combo option'
    },
    cartType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'personal',
      comment: 'Type of cart: personal or marketing'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    total: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    deliveryFee: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: 'Delivery fee for this item'
    },
    itemCommission: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
      comment: 'Marketing commission for this item (quantity * unit commission)'
    },
    batchId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Batches',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Cart',
    freezeTableName: true,
    timestamps: true,
    indexes: [
      {
        name: 'unique_user_product_variant_carttype',
        unique: true,
        fields: ['userId', 'productId', 'variantId', 'cartType'],
        where: {
          productId: { [Op.ne]: null }
        }
      },
      {
        name: 'unique_user_fastfood_variant_combo_batch_carttype',
        unique: true,
        fields: ['userId', 'fastFoodId', 'variantId', 'comboId', 'batchId', 'cartType'],
        where: {
          fastFoodId: { [Op.ne]: null }
        }
      },
      {
        name: 'unique_user_service_carttype',
        unique: true,
        fields: ['userId', 'serviceId', 'cartType'],
        where: {
          serviceId: { [Op.ne]: null }
        }
      },
      {
        name: 'idx_cart_userid_carttype',
        fields: ['userId', 'cartType']
      }
    ]
  });

  // Define associations
  Cart.associate = function (models) {
    Cart.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });

    Cart.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product'
    });

    Cart.belongsTo(models.FastFood, {
      foreignKey: 'fastFoodId',
      as: 'fastFood'
    });

    Cart.belongsTo(models.Service, {
      foreignKey: 'serviceId',
      as: 'service'
    });

    Cart.belongsTo(models.Batch, {
      foreignKey: 'batchId',
      as: 'batch'
    });
  };

  return Cart;
};
