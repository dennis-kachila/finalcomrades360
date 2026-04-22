const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SupportMessage = sequelize.define('SupportMessage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    type: {
      type: DataTypes.ENUM('admin_to_user', 'user_to_admin'),
      allowNull: false
    }
  }, {
    tableName: 'SupportMessages',
    timestamps: true
  });

  SupportMessage.associate = (models) => {
    SupportMessage.belongsTo(models.User, { foreignKey: 'senderId', as: 'sender' });
    SupportMessage.belongsTo(models.User, { foreignKey: 'receiverId', as: 'receiver' });
  };

  return SupportMessage;
};
