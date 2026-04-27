const { Op } = require('sequelize');
const models = require('../models');

const getCategories = async (req, res) => {
  try {
    console.log('[CategoryController] Fetching all categories');

    // Get all parent categories
    const categories = await models.Category.findAll({
      where: { parentId: null },
      order: [['name', 'ASC']]
    });

    // Get subcategories for each category from the Subcategory table
    const categoriesWithSubcategories = await Promise.all(
      categories.map(async (category) => {
        const subcategories = await models.Subcategory.findAll({
          where: { categoryId: category.id },
          order: [['name', 'ASC']]
        });

        return {
          ...category.toJSON(),
          Subcategory: subcategories, // Use capital S to match existing code expectations
          subcategories: subcategories // Add lowercase plural for frontend consistency
        };
      })
    );

    console.log('[CategoryController] Returning categories:', categoriesWithSubcategories.length);

    res.status(200).json(categoriesWithSubcategories);
  } catch (error) {
    console.error('Error in getCategories:', error);
    res.status(500).json({
      message: 'Server error while fetching categories',
      error: error.message
    });
  }
};

const getCategoriesWithProductCounts = async (req, res) => {
  try {
    console.log('[CategoryController] Fetching categories with product counts');

    // Get all categories (parent categories)
    const categories = await models.Category.findAll({
      where: { parentId: null },
      order: [['name', 'ASC']]
    });

    // Get product counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        // Count products in this category
        const productCount = await models.Product.count({
          where: {
            categoryId: category.id,
            approved: true,
            visibilityStatus: { [Op.ne]: 'hidden' },
            stock: { [Op.gt]: 0 }
          }
        });

        // Get subcategories for this category from the Subcategory model
        const subcategories = await models.Subcategory.findAll({
          where: { categoryId: category.id },
          order: [['name', 'ASC']]
        });

        // Get product counts for each subcategory
        const subcategoriesWithCounts = await Promise.all(
          subcategories.map(async (subcategory) => {
            const subcategoryCount = await models.Product.count({
              where: {
                subcategoryId: subcategory.id,
                approved: true,
                visibilityStatus: { [Op.ne]: 'hidden' },
                stock: { [Op.gt]: 0 }
              }
            });

            return {
              ...subcategory.toJSON(),
              productCount: subcategoryCount
            };
          })
        );

        return {
          ...category.toJSON(),
          productCount,
          subcategories: subcategoriesWithCounts,
          Subcategory: subcategoriesWithCounts // Added for compatibility with codebase expecting capital S
        };
      })
    );

    console.log('[CategoryController] Returning categories with counts:', categoriesWithCounts.length);

    res.status(200).json(categoriesWithCounts);
  } catch (error) {
    console.error('Error in getCategoriesWithProductCounts:', error);
    res.status(500).json({
      message: 'Server error while fetching categories with product counts',
      error: error.message
    });
  }
};

const getCategoryByIdWithProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    console.log('[CategoryController] Fetching category:', id, 'page:', page, 'limit:', limit);

    // Get category with its subcategories from the Subcategory model
    const category = await models.Category.findByPk(id, {
      include: [{
        model: models.Subcategory,
        as: 'Subcategory',
        order: [['name', 'ASC']]
      }]
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get products in this category
    const { count, rows: products } = await models.Product.findAndCountAll({
      where: {
        categoryId: id,
        approved: true,
        visibilityStatus: { [Op.ne]: 'hidden' },
        stock: { [Op.gt]: 0 }
      },
      include: [{
        model: models.User,
        as: 'seller',
        attributes: ['id', 'name', 'role', 'businessName'],
        required: false
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Process products for frontend
    const processedProducts = products.map(product => {
      const plain = product.get({ plain: true });

      // Add super admin flag
      if (plain.seller && ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase())) {
        plain.isSuperAdminProduct = true;
      } else {
        plain.isSuperAdminProduct = false;
      }

      return plain;
    });

    const categoryJSON = category.toJSON();
    categoryJSON.subcategories = categoryJSON.Subcategory || [];

    res.status(200).json({
      category: categoryJSON,
      products: processedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalProducts: count,
        productsPerPage: limit,
        hasMore: products.length === limit
      }
    });
  } catch (error) {
    console.error('Error in getCategoryByIdWithProducts:', error);
    res.status(500).json({
      message: 'Server error while fetching category products',
      error: error.message
    });
  }
};

const getSubcategoryByIdWithProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    console.log('[CategoryController] Fetching subcategory:', id, 'page:', page, 'limit:', limit);

    // Get subcategory from the Subcategory model
    const subcategory = await models.Subcategory.findByPk(id);

    if (!subcategory) {
      return res.status(404).json({ message: 'Subcategory not found' });
    }

    if (!subcategory.categoryId) {
      return res.status(400).json({ message: 'Not a subcategory' });
    }

    // Get products in this subcategory
    const { count, rows: products } = await models.Product.findAndCountAll({
      where: {
        subcategoryId: id,
        approved: true,
        visibilityStatus: { [Op.ne]: 'hidden' },
        stock: { [Op.gt]: 0 }
      },
      include: [{
        model: models.User,
        as: 'seller',
        attributes: ['id', 'name', 'role', 'businessName'],
        required: false
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Process products for frontend
    const processedProducts = products.map(product => {
      const plain = product.get({ plain: true });

      // Add super admin flag
      if (plain.seller && ['superadmin', 'super_admin', 'super-admin', 'admin'].includes(String(plain.seller.role || '').toLowerCase())) {
        plain.isSuperAdminProduct = true;
      } else {
        plain.isSuperAdminProduct = false;
      }

      return plain;
    });

    res.status(200).json({
      subcategory: subcategory.toJSON(),
      products: processedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalProducts: count,
        productsPerPage: limit,
        hasMore: products.length === limit
      }
    });
  } catch (error) {
    console.error('Error in getSubcategoryByIdWithProducts:', error);
    res.status(500).json({
      message: 'Server error while fetching subcategory products',
      error: error.message
    });
  }
};

const getSubcategories = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[CategoryController] Fetching subcategories for category:', id);

    const subcategories = await models.Subcategory.findAll({
      where: { categoryId: id },
      order: [['name', 'ASC']]
    });

    res.status(200).json(subcategories);
  } catch (error) {
    console.error('Error in getSubcategories:', error);
    res.status(500).json({
      message: 'Server error while fetching subcategories',
      error: error.message
    });
  }
};

module.exports = {
  getCategories,
  getCategoriesWithProductCounts,
  getCategoryByIdWithProducts,
  getSubcategoryByIdWithProducts,
  getSubcategories
};
