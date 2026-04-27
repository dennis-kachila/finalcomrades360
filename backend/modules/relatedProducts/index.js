const { Product, User } = require('../../models');
const { Op } = require('sequelize');

/**
 * Related Products Module
 * Handles calculation, storage, and retrieval of related product recommendations
 */

class RelatedProductsModule {
  constructor() {
    this.maxRelatedProducts = 6;
    this.priceRangeTolerance = 0.3; // ±30%
    this.updateThresholdDays = 7;
    this.batchSize = 50;
  }

  /**
   * Calculate related products for a specific product or batch of products
   * @param {number} productId - Specific product ID (optional)
   * @param {number} batchSize - Number of products to process in batch
   * @returns {Promise<Object>} Processing results
   */
  async calculateRelatedProducts(productId = null, batchSize = this.batchSize) {
    try {
      console.log('Starting related products calculation...');

      let productsToProcess;
      if (productId) {
        const product = await Product.findByPk(productId);
        productsToProcess = product ? [product] : [];
      } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - this.updateThresholdDays);

        productsToProcess = await Product.findAll({
          where: {
            approved: true,
            [Op.or]: [
              { relatedProductsLastUpdated: null },
              { relatedProductsLastUpdated: { [Op.lt]: sevenDaysAgo } },
              { relatedProducts: { [Op.eq]: null } },
              { relatedProducts: [] }
            ]
          },
          limit: batchSize,
          order: [['createdAt', 'DESC']]
        });
      }

      console.log(`Found ${productsToProcess.length} products to process`);

      let processedCount = 0;
      let errorCount = 0;

      for (const product of productsToProcess) {
        try {
          console.log(`Processing product ID ${product.id}: ${product.name}`);

          const relatedProductIds = await this.findRelatedProductIds(product);

          await product.update({
            relatedProducts: relatedProductIds,
            relatedProductsLastUpdated: new Date()
          });

          processedCount++;
          console.log(`✅ Updated related products for product ${product.id}`);

        } catch (error) {
          console.error(`❌ Error processing product ${product.id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`\nRelated products calculation completed:`);
      console.log(`- Products processed: ${processedCount}`);
      console.log(`- Errors: ${errorCount}`);
      console.log(`- Total attempted: ${productsToProcess.length}`);

      return { processedCount, errorCount, totalAttempted: productsToProcess.length };

    } catch (error) {
      console.error('Error in calculateRelatedProducts:', error);
      throw error;
    }
  }

  /**
   * Find related product IDs for a given product
   * @param {Object} product - Product instance
   * @returns {Promise<Array>} Array of related product IDs
   */
  async findRelatedProductIds(product) {
    const relatedIds = new Set();

    try {
      // 1. Same category products (60% of results)
      const categoryLimit = Math.ceil(this.maxRelatedProducts * 0.6);
      const categoryProducts = await Product.findAll({
        where: {
          categoryId: product.categoryId,
          id: { [Op.ne]: product.id },
          approved: true,
          stock: { [Op.gt]: 0 },
          visibilityStatus: 'visible',
          suspended: false,
          isActive: true,
          status: 'active'
        },
        attributes: ['id'],
        limit: categoryLimit,
        order: [
          ['soldCount', 'DESC'], // Prioritize best-selling products
          ['viewCount', 'DESC'], // Then most viewed
          ['createdAt', 'DESC']  // Then newest
        ]
      });

      categoryProducts.forEach(p => relatedIds.add(p.id));

      // 2. Same subcategory if available (additional 20%)
      if (product.subcategoryId && relatedIds.size < this.maxRelatedProducts) {
        const subcategoryLimit = Math.ceil(this.maxRelatedProducts * 0.2);
        const subcategoryProducts = await Product.findAll({
          where: {
            subcategoryId: product.subcategoryId,
            approved: true,
            stock: { [Op.gt]: 0 },
            visibilityStatus: 'visible',
            suspended: false,
            isActive: true,
            status: 'active',
            id: { [Op.notIn]: [product.id, ...Array.from(relatedIds)] }
          },
          attributes: ['id'],
          limit: subcategoryLimit,
          order: [
            ['soldCount', 'DESC'],
            ['viewCount', 'DESC'],
            ['createdAt', 'DESC']
          ]
        });

        subcategoryProducts.forEach(p => relatedIds.add(p.id));
      }

      // 3. Similar price range (additional 10%)
      if (relatedIds.size < this.maxRelatedProducts) {
        const minPrice = Math.max(0, product.basePrice * (1 - this.priceRangeTolerance));
        const maxPrice = product.basePrice * (1 + this.priceRangeTolerance);

        const priceProducts = await Product.findAll({
          where: {
            basePrice: { [Op.between]: [minPrice, maxPrice] },
            categoryId: product.categoryId,
            approved: true,
            stock: { [Op.gt]: 0 },
            visibilityStatus: 'visible',
            suspended: false,
            isActive: true,
            status: 'active',
            id: { [Op.notIn]: [product.id, ...Array.from(relatedIds)] }
          },
          attributes: ['id'],
          limit: 1,
          order: [
            ['soldCount', 'DESC'],
            ['viewCount', 'DESC']
          ]
        });

        priceProducts.forEach(p => relatedIds.add(p.id));
      }

      // 4. Same brand (additional 10%)
      if (product.brand && relatedIds.size < this.maxRelatedProducts) {
        const brandProducts = await Product.findAll({
          where: {
            brand: product.brand,
            approved: true,
            stock: { [Op.gt]: 0 },
            visibilityStatus: 'visible',
            suspended: false,
            isActive: true,
            status: 'active',
            id: { [Op.notIn]: [product.id, ...Array.from(relatedIds)] }
          },
          attributes: ['id'],
          limit: 1,
          order: [
            ['soldCount', 'DESC'],
            ['viewCount', 'DESC'],
            ['createdAt', 'DESC']
          ]
        });

        brandProducts.forEach(p => relatedIds.add(p.id));
      }

      const finalRelatedIds = Array.from(relatedIds).slice(0, this.maxRelatedProducts);

      console.log(`Found ${finalRelatedIds.length} related products for product ${product.id}`);
      return finalRelatedIds;

    } catch (error) {
      console.error(`Error finding related products for product ${product.id}:`, error);
      return [];
    }
  }

  /**
   * Get full related product data for API response
   * @param {Array} relatedProductIds - Array of product IDs
   * @returns {Promise<Array>} Array of product objects
   */
  async getRelatedProductsData(relatedProductIds) {
    if (!relatedProductIds || relatedProductIds.length === 0) {
      return [];
    }

    try {
      const relatedProducts = await Product.findAll({
        where: {
          id: { [Op.in]: relatedProductIds },
          approved: true,
          visibilityStatus: 'visible',
          suspended: false,
          isActive: true,
          status: 'active',
          stock: { [Op.gt]: 0 }
        },
        attributes: [
          'id', 'name', 'shortDescription', 'basePrice', 'displayPrice',
          'images', 'brand', 'categoryId', 'subcategoryId'
        ],
        include: [
          {
            model: User,
            as: 'seller',
            attributes: ['id', 'name'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      return relatedProducts;
    } catch (error) {
      console.error('Error fetching related products data:', error);
      return [];
    }
  }

  /**
   * Check if product needs related products recalculation
   * @param {Object} product - Product instance
   * @returns {boolean} Whether recalculation is needed
   */
  needsRecalculation(product) {
    if (!product.relatedProductsLastUpdated) return true;
    if (!product.relatedProducts || product.relatedProducts.length === 0) return true;

    const daysSinceUpdate = (new Date() - product.relatedProductsLastUpdated) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > this.updateThresholdDays;
  }

  /**
   * Trigger related products calculation for a product
   * @param {number} productId - Product ID
   * @returns {Promise<void>}
   */
  async triggerCalculation(productId) {
    setImmediate(async () => {
      try {
        await this.calculateRelatedProducts(productId, 1);
        console.log(`Related products calculated for product ${productId}`);
      } catch (error) {
        console.error(`Failed to calculate related products for product ${productId}:`, error);
      }
    });
  }

  /**
   * Maintenance function to update all stale related products
   * @returns {Promise<Object>} Maintenance results
   */
  async performMaintenance() {
    try {
      console.log('Starting scheduled maintenance of related products...');

      let totalProcessed = 0;
      let totalErrors = 0;
      let hasMore = true;

      while (hasMore) {
        console.log(`\nProcessing batch (batch size: ${this.batchSize})...`);

        const result = await this.calculateRelatedProducts(null, this.batchSize);

        totalProcessed += result.processedCount;
        totalErrors += result.errorCount;

        if (result.totalAttempted < this.batchSize) {
          hasMore = false;
        }

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`\nScheduled maintenance completed:`);
      console.log(`- Total products processed: ${totalProcessed}`);
      console.log(`- Total errors: ${totalErrors}`);
      console.log(`- Success rate: ${totalProcessed > 0 ? ((totalProcessed / (totalProcessed + totalErrors)) * 100).toFixed(1) : 0}%`);

      return { totalProcessed, totalErrors };

    } catch (error) {
      console.error('Error in performMaintenance:', error);
      throw error;
    }
  }
}

// Export singleton instance
const relatedProductsModule = new RelatedProductsModule();

module.exports = relatedProductsModule;