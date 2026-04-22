const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DeletedFastFood = sequelize.define('DeletedFastFood', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    originalId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Original fast food ID before deletion'
    },
    vendor: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    subcategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    shortDescription: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mainImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    galleryImages: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    basePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    displayPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    discountPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    vendorLocation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    vendorLat: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    vendorLng: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    preparationTimeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    deliveryTimeEstimateMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    sizeVariants: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    comboOptions: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    ingredients: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    dietaryTags: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    deliveryCoverageZones: {
      type: DataTypes.JSON,
      allowNull: true
    },
    marketingEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reviewStatus: {
      type: DataTypes.STRING,
      allowNull: true
    },
    approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deletionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    autoDeleteAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When this record will be permanently deleted (30 days from deletion)'
    }
  }, {
    tableName: 'DeletedFastFoods',
    timestamps: true,
    indexes: [
      {
        fields: ['vendor']
      },
      {
        fields: ['autoDeleteAt']
      },
      {
        fields: ['originalId']
      }
    ]
  });

  DeletedFastFood.associate = (models) => {
    DeletedFastFood.belongsTo(models.User, {
      foreignKey: 'vendor',
      as: 'vendorDetail'
    });
  };

  return DeletedFastFood;
};
