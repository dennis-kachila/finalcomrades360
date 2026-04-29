const { DataTypes, Model } = require('sequelize');
const { normalizeItemName } = require('../utils/itemNamePolicy');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static async isNameTaken(name, excludeId = null) {
      const where = { 
        name,
        deletedAt: null
      };
      
      if (excludeId) {
        const SafeOp = sequelize.Op || (sequelize.Sequelize && sequelize.Sequelize.Op) || { ne: '$ne' };
        where.id = { [SafeOp.ne]: excludeId };
      }

      const existing = await this.findOne({ where });
      return !!existing;
    }
  }

  Product.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    compareAtPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    basePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00,
      comment: 'Base price set by seller'
    },
    displayPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
      comment: 'Display price set by superadmin (takes priority over basePrice)'
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    lowStockThreshold: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 5
    },
    sku: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    barcode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    weight: {
      type: DataTypes.STRING,
      allowNull: true
    },
    dimensions: {
      type: DataTypes.JSON,
      allowNull: true
    },

    coverImage: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    galleryImages: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    shortDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fullDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null
    },
    discountPercentage: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isFlashSale: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    unitOfMeasure: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'pcs'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'draft', 'archived'),
      defaultValue: 'draft'
    },
    visibilityStatus: {
      type: DataTypes.ENUM('visible', 'hidden'),
      defaultValue: 'visible'
    },
    reviewStatus: {
      type: DataTypes.ENUM('draft', 'pending', 'approved', 'rejected'),
      defaultValue: 'pending'
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    keyFeatures: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      get() {
        const raw = this.getDataValue('keyFeatures');
        if (!raw) return [];
        // Deep-unwrap: keep parsing strings until we reach the innermost value
        const deepUnwrap = (val) => {
          let cur = val;
          for (let i = 0; i < 10; i++) {
            if (typeof cur !== 'string') break;
            const t = cur.trim();
            if (!(t.startsWith('[') || t.startsWith('"'))) break;
            try { cur = JSON.parse(t); } catch { break; }
          }
          return cur;
        };
        // Clean a single string item — strip surrounding quotes/brackets
        const cleanItem = (s) => String(s).replace(/^["\[\]\s]+|["\[\]\s]+$/g, '').trim();
        // Split a flat string that may encode multiple items as: "item1","item2",...
        const splitFlatString = (s) => {
          const stripped = s.trim();
          // Detect pattern: starts/ends with quote and contains ","
          if (stripped.includes('","') || stripped.includes("','")) {
            return stripped
              .split(/","|','/g)
              .map(cleanItem)
              .filter(Boolean);
          }
          const cleaned = cleanItem(stripped);
          return cleaned ? [cleaned] : [];
        };

        let unwrapped = deepUnwrap(raw);
        if (Array.isArray(unwrapped)) {
          return unwrapped
            .map(item => {
              const v = deepUnwrap(item);
              if (Array.isArray(v)) return v.map(x => cleanItem(String(x)));
              if (typeof v === 'string') return splitFlatString(v);
              return [cleanItem(String(v))];
            })
            .flat(Infinity)
            .filter(Boolean);
        }
        if (typeof unwrapped === 'string' && unwrapped.trim()) {
          return splitFlatString(unwrapped);
        }
        return [];
      }
    },
    specifications: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    attributes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    variants: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    logistics: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    deliveryMethod: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Pickup'
    },
    deliveryCoverageZones: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('deliveryCoverageZones');
        try {
          return rawValue ? JSON.parse(rawValue) : [];
        } catch (e) {
          return rawValue ? rawValue.split(',').map(z => z.trim()) : [];
        }
      },
      set(value) {
        this.setDataValue('deliveryCoverageZones', JSON.stringify(Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',').map(z => z.trim()) : [])));
      }
    },
    deliveryFee: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
      allowNull: false
    },
    warranty: {
      type: DataTypes.STRING,
      allowNull: true
    },
    returnPolicy: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    keywords: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    shareableLink: {
      type: DataTypes.STRING,
      allowNull: true
    },
    brand: {
      type: DataTypes.STRING,
      allowNull: true
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true
    },
    suspended: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    suspensionReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    suspensionEndTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    suspensionDuration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    suspensionDurationUnit: {
      type: DataTypes.STRING,
      allowNull: true
    },
    suspensionAdditionalNotes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    relatedProducts: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    metaKeywords: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    media: {
      type: DataTypes.JSON,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    approved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hasBeenApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    marketingEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    marketingCommission: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    marketingCommissionType: {
      type: DataTypes.STRING,
      defaultValue: 'flat'
    },
    marketingCommissionPercentage: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: []
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Category',
        key: 'id'
      }
    },
    subcategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Subcategory',
        key: 'id'
      }
    },
    sellerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    addedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'User',
        key: 'id'
      }
    },
    metaTitle: {
      type: DataTypes.STRING,
      allowNull: true
    },
    metaDescription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      defaultValue: 0.00
    },
    reviewCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    soldCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    isDigital: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    downloadUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    flashSalePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    flashSaleStart: {
      type: DataTypes.DATE,
      allowNull: true
    },
    flashSaleEnd: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    sequelize,
    modelName: 'Product',
    freezeTableName: true,
    timestamps: true,
    paranoid: false,
    defaultScope: {
      where: {
        // deletedAt: null // Commented out as paranoid is false
      }
    },
    scopes: {
      withDeleted: {
        where: {},
        paranoid: false
      }
    },
    hooks: {
      afterSave: async (product) => {
        emitRealtimeUpdate('products', { id: product.id });
      },
      afterDestroy: async (product) => {
        emitRealtimeUpdate('products', { id: product.id, deleted: true });
      },
      afterBulkUpdate: async (options) => {
        emitRealtimeUpdate('products');
      }
    },
    indexes: [
      {
        fields: ['categoryId'],
        using: 'BTREE'
      },
      {
        fields: ['approved', 'visibilityStatus', 'suspended', 'isActive', 'status'],
        name: 'product_active_filter_idx'
      },
      {
        fields: ['isFeatured', 'approved'],
        name: 'product_featured_idx'
      },
      {
        fields: ['sellerId'],
        using: 'BTREE'
      },
      {
        fields: ['updatedAt'],
        name: 'product_updated_at_idx'
      }
    ]
  });

  // Add unique index for non-deleted records only
  Product.addHook('beforeValidate', async (product) => {
    if (product.name) {
      product.name = normalizeItemName(product.name);
    }

    if (product.changed('name') && product.name) {
      const isTaken = await Product.isNameTaken(product.name, product.id);
      if (isTaken) {
        throw new Error('A product with this name already exists');
      }
    }
  });

  // Define associations
  Product.associate = function (models) {
    // Category relationship
    Product.belongsTo(models.Category, {
      foreignKey: 'categoryId',
      as: 'category'
    });

    // Subcategory relationship
    Product.belongsTo(models.Subcategory, {
      foreignKey: 'subcategoryId',
      as: 'subcategory'
    });

    // Seller relationship
    Product.belongsTo(models.User, {
      foreignKey: 'sellerId',
      as: 'seller'
    });

    // Added by relationship (for super admin products)
    Product.belongsTo(models.User, {
      foreignKey: 'addedBy',
      as: 'addedByUser'
    });

    // Order items relationship
    Product.hasMany(models.OrderItem, {
      foreignKey: 'productId',
      as: 'orderItems'
    });

    // Cart items relationship
    Product.hasMany(models.CartItem, {
      foreignKey: 'productId',
      as: 'cartItems'
    });

    // Wishlist relationship
    Product.hasMany(models.Wishlist, {
      foreignKey: 'productId',
      as: 'wishlistItems'
    });

    // Product variants relationship
    Product.hasMany(models.ProductVariant, {
      foreignKey: 'productId',
      as: 'productVariants',
      onDelete: 'CASCADE'
    });

    // Product views relationship
    Product.hasMany(models.ProductView, {
      foreignKey: 'productId',
      as: 'views',
      onDelete: 'CASCADE'
    });

    // Product inquiries relationship
    Product.hasMany(models.ProductInquiry, {
      foreignKey: 'productId',
      as: 'inquiries',
      onDelete: 'CASCADE'
    });

    // Commission relationship
    Product.hasMany(models.Commission, {
      foreignKey: 'productId',
      as: 'commissions',
      onDelete: 'CASCADE'
    });
  };

  return Product;
};