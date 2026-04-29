const { DataTypes } = require('sequelize');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {

  const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING, defaultValue: 'info' }, // info, success, warning, alert
    read: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, {
    freezeTableName: true,
    timestamps: true,
  });

  Notification.afterCreate(async (notification) => {
    emitRealtimeUpdate('notifications', { userId: notification.userId });
  });

  Notification.associate = function (models) {
    Notification.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Notification;
};
