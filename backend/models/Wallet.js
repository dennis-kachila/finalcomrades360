const { DataTypes } = require('sequelize');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {

  const Wallet = sequelize.define("Wallet", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    balance: { type: DataTypes.FLOAT, defaultValue: 0 },
    pendingBalance: { type: DataTypes.FLOAT, defaultValue: 0 },
    successBalance: { type: DataTypes.FLOAT, defaultValue: 0 }
  }, {
    freezeTableName: true,  // disables automatic pluralization
    timestamps: true
  });

  Wallet.afterSave(async (wallet) => {
    emitRealtimeUpdate('users', { userId: wallet.userId });
  });

  Wallet.associate = (models) => {
    Wallet.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Wallet;
};
