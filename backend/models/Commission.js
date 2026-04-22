const { DataTypes } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const Commission = sequelize.define("Commission", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    marketerId: { type: DataTypes.INTEGER, allowNull: false },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    fastFoodId: { type: DataTypes.INTEGER, allowNull: true },
    serviceId: { type: DataTypes.INTEGER, allowNull: true },
    saleAmount: { type: DataTypes.FLOAT, allowNull: false },
    commissionRate: { type: DataTypes.FLOAT, allowNull: false }, // percentage
    commissionAmount: { type: DataTypes.FLOAT, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'success', 'paid', 'cancelled'), defaultValue: 'pending' },
    referralCode: { type: DataTypes.STRING, allowNull: false },
    commissionType: { type: DataTypes.ENUM('full_100', 'primary_60', 'secondary_40'), defaultValue: 'full_100' },
    paidAt: { type: DataTypes.DATE },
    pricingMethod: { type: DataTypes.STRING, allowNull: true }
  }, { freezeTableName: true, timestamps: true });

  Commission.associate = (models) => {
    Commission.belongsTo(models.Order, { foreignKey: 'orderId' });
    Commission.belongsTo(models.User, { foreignKey: 'marketerId', as: 'marketer' });
    Commission.belongsTo(models.Product, { foreignKey: 'productId' });
    Commission.belongsTo(models.FastFood, { foreignKey: 'fastFoodId' });
    Commission.belongsTo(models.Service, { foreignKey: 'serviceId' });
  };

  return Commission;
};
