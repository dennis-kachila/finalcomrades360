const { DataTypes, Model } = require('sequelize');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {
  class Subcategory extends Model {
    static async isNameTaken(name, categoryId, excludeId = null) {
      const where = {
        name,
        categoryId,
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

  Subcategory.init({
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
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    modelName: 'Subcategory',
    tableName: 'Subcategory',
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

  // Add unique index for non-deleted records only within the same category
  Subcategory.addHook('beforeValidate', async (subcategory) => {
    if ((subcategory.changed('name') || subcategory.changed('categoryId')) && subcategory.name && subcategory.categoryId) {
      const isTaken = await Subcategory.isNameTaken(
        subcategory.name,
        subcategory.categoryId,
        subcategory.id
      );
      if (isTaken) {
        throw new Error('A subcategory with this name already exists in this category');
      }
    }
  });

  // Define associations
  Subcategory.associate = function (models) {
    // Belongs to Category
    Subcategory.belongsTo(models.Category, {
      foreignKey: 'categoryId',
      as: 'Category',
      onDelete: 'CASCADE',
      hooks: true
    });


  };

  return Subcategory;
};