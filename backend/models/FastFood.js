const { DataTypes } = require('sequelize');
const { normalizeItemName } = require('../utils/itemNamePolicy');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize) => {
    const FastFood = sequelize.define('FastFood', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
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
            allowNull: true,
            references: {
                model: 'Category',
                key: 'id'
            }
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
            defaultValue: '/uploads/default-food.jpg'
        },
        galleryImages: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        basePrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        discountPercentage: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // NEW FIELD: Auto-calculated display price
        displayPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        // NEW FIELD: Auto-calculated price after discount
        discountPrice: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        availableFrom: {
            type: DataTypes.STRING,
            allowNull: true
        },
        availableTo: {
            type: DataTypes.STRING,
            allowNull: true
        },
        availabilityDays: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        preparationTimeMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sizeVariants: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        isComboOption: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        comboOptions: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        ingredients: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        kitchenVendor: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // NEW FIELDS FOR SMART LOCATION FILTERING
        vendorLocation: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Human readable address/location of the kitchen'
        },
        vendorLat: {
            type: DataTypes.DECIMAL(10, 8),
            allowNull: true,
            comment: 'Latitude for distance calculation'
        },
        vendorLng: {
            type: DataTypes.DECIMAL(11, 8),
            allowNull: true,
            comment: 'Longitude for distance calculation'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        deliveryTimeEstimateMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        pickupAvailable: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        pickupLocation: {
            type: DataTypes.STRING,
            allowNull: true
        },
        deliveryAreaLimits: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        vendor: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        ratings: {
            type: DataTypes.JSON,
            defaultValue: { average: 0, count: 0 }
        },
        orderCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive', 'pending', 'approved', 'suspended'),
            defaultValue: 'pending',
            allowNull: false
        },
        reviewStatus: {
            type: DataTypes.ENUM('draft', 'pending', 'approved', 'rejected'),
            defaultValue: 'pending'
        },
        approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        hasBeenApproved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        reviewNotes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        rejectionReason: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Audit field: Who actually properly created this record
        addedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'User',
                key: 'id'
            }
        },
        // NEW FIELD: Track changes for approved items
        changes: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        tags: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        isAvailable: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        allergens: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        customizations: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        // NEW FIELD: Nutritional facts
        nutritionalInfo: {
            type: DataTypes.JSON,
            defaultValue: {
                calories: '',
                protein: '',
                carbs: '',
                fat: ''
            }
        },
        // NEW FIELD: Spice level (mild, medium, hot, extra hot)
        spiceLevel: {
            type: DataTypes.STRING,
            defaultValue: 'none'
        },
        // NEW FIELD: Daily production limit
        dailyLimit: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        // NEW FIELD: Estimated servings
        estimatedServings: {
            type: DataTypes.STRING,
            defaultValue: '1 person'
        },
        // NEW FIELD: Dietary tags
        dietaryTags: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        // NEW FIELD: Featured item toggle
        isFeatured: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        // NEW FIELD: Minimum order quantity
        minOrderQty: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        // NEW FIELD: Maximum order quantity
        maxOrderQty: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // Delivery Configuration
        deliveryFeeType: {
            type: DataTypes.ENUM('fixed', 'percentage', 'free'),
            defaultValue: 'fixed',
            allowNull: false
        },
        deliveryFee: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,  // null = not set, 0 = free delivery, >0 = fee amount
            defaultValue: null,
            comment: 'Must be set by superadmin during listing. null=not set, 0=free delivery'
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
        availabilityMode: {
            type: DataTypes.ENUM('AUTO', 'OPEN', 'CLOSED'),
            defaultValue: 'AUTO',
            allowNull: false,
            comment: 'Manual status override: AUTO follows schedule, OPEN forces open, CLOSED forces closed'
        },
        subcategoryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'Subcategory',
                key: 'id'
            }
        }
    }, {
        tableName: 'FastFoods',
        indexes: [
            {
                fields: ['reviewStatus', 'isActive', 'isAvailable'],
                name: 'fastfood_active_idx'
            },
            {
                fields: ['category'],
                using: 'BTREE'
            },
            {
                fields: ['subcategoryId'],
                using: 'BTREE'
            },
            {
                fields: ['vendor'],
                using: 'BTREE'
            }
        ],
        hooks: {
            beforeSave: (fastFood) => {
                if (fastFood.name) {
                    fastFood.name = normalizeItemName(fastFood.name);
                }

                // 1. Standardize Size Variants Pricing
                if (fastFood.sizeVariants && Array.isArray(fastFood.sizeVariants)) {
                    fastFood.sizeVariants = fastFood.sizeVariants.map(v => {
                        const base = parseFloat(v.basePrice || v.price || 0);
                        // DO NOT fallback display to base. Keep it as is (likely provided by admin later)
                        const display = v.displayPrice ? parseFloat(v.displayPrice) : 0;
                        const discount = parseFloat(v.discountPercentage || 0);

                        // Calculate final price only if display price is set
                        let finalDisplay = 0;
                        if (display > 0) {
                            if (v.discountPrice && parseFloat(v.discountPrice) > 0 && discount > 0) {
                                finalDisplay = parseFloat(v.discountPrice);
                            } else {
                                finalDisplay = (discount > 0) ? display * (1 - discount / 100) : display;
                            }
                        }

                        return {
                            ...v,
                            basePrice: base,
                            displayPrice: display > 0 ? display : null,
                            discountPercentage: discount,
                            discountPrice: finalDisplay > 0 ? parseFloat(finalDisplay.toFixed(2)) : null,
                            price: finalDisplay > 0 ? parseFloat(finalDisplay.toFixed(2)) : null // Sync for backward compatibility
                        };
                    });
                }

                // 3. Standardize Combo Options Pricing
                if (fastFood.comboOptions && Array.isArray(fastFood.comboOptions)) {
                    fastFood.comboOptions = fastFood.comboOptions.map(c => {
                        const base = parseFloat(c.basePrice || c.price || 0);
                        // DO NOT fallback display to base.
                        const display = c.displayPrice ? parseFloat(c.displayPrice) : 0;
                        const discount = parseFloat(c.discountPercentage || 0);

                        // Calculate final price only if display price is set
                        let finalDisplay = 0;
                        if (display > 0) {
                            if (c.discountPrice && parseFloat(c.discountPrice) > 0 && discount > 0) {
                                finalDisplay = parseFloat(c.discountPrice);
                            } else {
                                finalDisplay = (discount > 0) ? display * (1 - discount / 100) : display;
                            }
                        }

                        return {
                            ...c,
                            basePrice: base,
                            displayPrice: display > 0 ? display : null,
                            discountPercentage: discount,
                            discountPrice: finalDisplay > 0 ? parseFloat(finalDisplay.toFixed(2)) : null,
                            price: finalDisplay > 0 ? parseFloat(finalDisplay.toFixed(2)) : null // Sync for backward compatibility
                        };
                    });
                }
            },
            afterSave: async (fastFood) => {
                emitRealtimeUpdate('fastfood', { id: fastFood.id });
            },
            afterDestroy: async (fastFood) => {
                emitRealtimeUpdate('fastfood', { id: fastFood.id, deleted: true });
            },
            afterBulkUpdate: async (options) => {
                emitRealtimeUpdate('fastfood');
            }
        }
    });

    // Define associations
    FastFood.associate = (models) => {
        FastFood.belongsTo(models.User, {
            foreignKey: 'vendor',
            as: 'vendorDetail'
        });
        FastFood.belongsTo(models.Subcategory, {
            foreignKey: 'subcategoryId',
            as: 'subcategory'
        });
        FastFood.belongsTo(models.Category, {
            foreignKey: 'categoryId',
            as: 'categoryDetail'
        });

        FastFood.belongsTo(models.User, {
            foreignKey: 'addedBy',
            as: 'creator'
        });

        // Wishlist relationship
        FastFood.hasMany(models.Wishlist, {
            foreignKey: 'fastFoodId',
            as: 'wishlistItems'
        });

        // Cart relationship
        FastFood.hasMany(models.Cart, {
            foreignKey: 'fastFoodId',
            as: 'cartItems'
        });
    };

    return FastFood;
};
