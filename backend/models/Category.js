const { DataTypes, Model } = require('sequelize');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {
  class Category extends Model {
    static async isNameTaken(name, excludeId = null) {
      const where = { 
        name,
        deletedAt: null
      };
      
      if (excludeId) {
        const Op = sequelize.Op || (sequelize.Sequelize && sequelize.Sequelize.Op) || { ne: '$ne' };
        where.id = { [Op.ne]: excludeId };
      }
      
      const existing = await this.findOne({ where });
      return !!existing;
    }
  }

  Category.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    emoji: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: '📦'
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Category',
        key: 'id'
      }
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    taxonomyType: {
      type: DataTypes.ENUM('product', 'service', 'fast_food'),
      allowNull: false,
      defaultValue: 'product'
    }
  }, {
    sequelize,
    modelName: 'Category',
    freezeTableName: true,
    timestamps: true,
    paranoid: true,
    defaultScope: {
      where: {
        deletedAt: null
      }
    },
    scopes: {
      withDeleted: {
        where: {},
        paranoid: false
      }
    },
    hooks: {
      afterSave: async () => { emitRealtimeUpdate('categories'); },
      afterDestroy: async () => { emitRealtimeUpdate('categories'); },
      afterBulkUpdate: async () => { emitRealtimeUpdate('categories'); }
    }
  });
  
  // Add unique index for non-deleted records only
  Category.addHook('beforeValidate', async (category) => {
    if (category.changed('name') && category.name) {
      const isTaken = await Category.isNameTaken(category.name, category.id);
      if (isTaken) {
        throw new Error('A category with this name already exists');
      }
    }
  });

  // Define associations
  Category.associate = function(models) {
    // Self-referential relationship for parent-child categories
    Category.belongsTo(models.Category, {
      foreignKey: 'parentId',
      as: 'parent'
    });

    Category.hasMany(models.Category, {
      foreignKey: 'parentId',
      as: 'children'
    });

    // Relationship with Subcategory
    Category.hasMany(models.Subcategory, {
      foreignKey: 'categoryId',
      as: 'Subcategory',
      onDelete: 'CASCADE',
      hooks: true
    });


  };

  return Category;
};
