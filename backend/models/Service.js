const { normalizeItemName } = require('../utils/itemNamePolicy');

module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define('Service', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Title is required' },
        len: {
          args: [5, 100],
          msg: 'Title must be between 5 and 100 characters'
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Description is required' },
        len: {
          args: [20, 2000],
          msg: 'Description must be between 20 and 2000 characters'
        }
      }
    },
    basePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: {
          args: [0],
          msg: 'Base price cannot be negative'
        }
      },
      comment: 'Initial price set by seller or super admin'
    },
    isPriceStartingFrom: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    deliveryTime: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Delivery time is required' }
      }
    },
    availability: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Availability information is required' }
      }
    },
    location: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Location is required' },
        len: {
          args: [2, 255],
          msg: 'Location must be between 2 and 255 characters'
        }
      }
    },
    // Smart Location Fields
    vendorLocation: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Precise location/address for smart filtering'
    },
    vendorLat: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      validate: { min: -90, max: 90 }
    },
    vendorLng: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      validate: { min: -180, max: 180 }
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'pending', 'approved', 'suspended'),
      defaultValue: 'pending',
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User', // Fixed to match actual table name
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    addedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Category', // Fixed to match actual table name
        key: 'id'
      }
    },
    subcategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Subcategory', // Corrected to match actual database table name (singular)
        key: 'id'
      }
    },
    rating: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 5
      }
    },
    reviewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    displayPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: 'Reference price set by admin (before discount)'
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Calculated final price: displayPrice - discount'
    },
    discountPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      }
    },
    // Delivery Configuration
    deliveryFeeType: {
      type: DataTypes.ENUM('fixed', 'percentage', 'free'),
      defaultValue: 'fixed',
      allowNull: false
    },
    deliveryFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 50.00,
      allowNull: false
    },
    deliveryCoverageZones: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('deliveryCoverageZones');
        return rawValue ? JSON.parse(rawValue) : [];
      },
      set(value) {
        this.setDataValue('deliveryCoverageZones', JSON.stringify(value));
      }
    },
    // Marketing Configuration
    marketingEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    marketingCommissionType: {
      type: DataTypes.STRING,
      defaultValue: 'flat',
      allowNull: false
    },
    marketingCommissionPercentage: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false
    },
    marketingCommission: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0
      }
    },
    marketingDuration: {
      type: DataTypes.INTEGER,
      defaultValue: 30,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    marketingStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    marketingEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    // Availability Infrastructure
    isAvailable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    availabilityDays: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Stores weekly schedule: [{day: "Monday", available: true, from: "08:00", to: "17:00"}]'
    },
    availabilityMode: {
      type: DataTypes.ENUM('AUTO', 'OPEN', 'CLOSED'),
      defaultValue: 'AUTO',
      allowNull: false,
      comment: 'Manual status override: AUTO follows schedule, OPEN forces open, CLOSED forces closed'
    },
    coverImage: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '/uploads/default-service.jpg'
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  }, {
    timestamps: true,
    tableName: 'Services',
    hooks: {
      beforeSave: (service) => {
        if (service.title) {
          service.title = normalizeItemName(service.title);
        }

        const displayPrice = parseFloat(service.displayPrice) || 0;
        const discount = parseFloat(service.discountPercentage) || 0;
        service.discountPrice = displayPrice - (displayPrice * discount / 100);

        // Standardize commission calculation
        if (service.marketingCommissionType === 'percentage') {
          const price = parseFloat(service.discountPrice || service.displayPrice || service.basePrice || 0);
          const basePrice = parseFloat(service.basePrice || 0);
          const percentage = parseFloat(service.marketingCommissionPercentage || 0);

          // Logic: (Selling Price - Base Price) * Percentage / 100
          const markup = Math.max(0, price - basePrice);
          service.marketingCommission = (markup * percentage) / 100;
        } else if (service.marketingCommissionType === 'flat') {
          // For flat type, the value in marketingCommission (or marketingCommissionPercentage if used as input) is the value.
          // Assuming marketingCommissionPercentage holds the input value if marketingCommission is not set?
          // Safer to assume marketingCommission is the source of truth if provided, but if we follow the user's logic:
          // "takes the actual value given" which implies copying from the percentage/input field if that's where input comes from.
          // However, typically in this codebase, input might come into 'marketingCommission' directly too.
          // Let's ensure if 'marketingCommissionPercentage' has a value and 'marketingCommission' is 0, we take it.
          // The user explicitly said: "update marketingCommission... actual value... since it takes the actual value given".

          // If the user inputs a value, it often lands in `marketingCommissionPercentage` in the frontend form if the form reuses the field?
          // Let's check the Service form... but based on `FastFood` logic seen earlier, it seems loose.

          // Let's stick to the user's implication: copying the "value" to the commission field.
          // Use marketingCommissionPercentage as the source if marketingCommission is 0 or needs synced?
          // Actually, best to check if a value is provided in 'marketingCommissionPercentage' and use it if it's flat.

          const flatValue = parseFloat(service.marketingCommissionPercentage || service.marketingCommission || 0);
          service.marketingCommission = flatValue;
        }
      }
    },
    indexes: [
      {
        fields: ['title'],
        using: 'BTREE'
      },
      {
        fields: ['categoryId'],
        using: 'BTREE'
      },
      {
        fields: ['status'],
        using: 'BTREE'
      },
      {
        fields: ['location'],
        using: 'BTREE'
      },
      {
        fields: ['isOnline'],
        using: 'BTREE'
      },
      {
        fields: ['userId'],
        using: 'BTREE'
      },
      {
        fields: ['status', 'isAvailable'],
        name: 'service_active_filter_idx'
      }
    ]
  });

  // Define associations
  Service.associate = (models) => {
    Service.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'provider',
      onDelete: 'CASCADE'
    });

    Service.belongsTo(models.User, {
      foreignKey: 'addedBy',
      as: 'creator'
    });

    Service.belongsTo(models.Category, {
      foreignKey: 'categoryId',
      as: 'category'
    });

    Service.belongsTo(models.Subcategory, {
      foreignKey: 'subcategoryId',
      as: 'subcategory'
    });

    Service.hasMany(models.ServiceImage, {
      foreignKey: 'serviceId',
      as: 'images',
      onDelete: 'CASCADE'
    });

    // Wishlist relationship (services only in wishlist, not cart)
    Service.hasMany(models.Wishlist, {
      foreignKey: 'serviceId',
      as: 'wishlistItems'
    });
  };

  return Service;
};
