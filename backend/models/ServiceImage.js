module.exports = (sequelize, DataTypes) => {
  const ServiceImage = sequelize.define('ServiceImage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Image URL is required' }
      }
    },
    isThumbnail: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Services',
        key: 'id'
      },
      onDelete: 'CASCADE'
    }
  }, {
    timestamps: true,
    tableName: 'ServiceImages',
    indexes: [
      {
        fields: ['serviceId'],
        using: 'BTREE'
      },
      {
        fields: ['isThumbnail'],
        using: 'BTREE'
      }
    ]
  });

  // Define associations
  ServiceImage.associate = (models) => {
    ServiceImage.belongsTo(models.Service, {
      foreignKey: 'serviceId',
      as: 'service',
      onDelete: 'CASCADE'
    });
  };

  return ServiceImage;
};
