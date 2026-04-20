const { sequelize } = require('../database/database');
const { Product, StockReservation, StockAuditLog, WarehouseStock, Warehouse, User, Notification } = require('../models');
const { Op } = require('sequelize');
const { emitRealtimeUpdate, emitToUser, emitToAdmins } = require('../utils/realtimeEmitter');

// Stock Reservation Logic
const reserveStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items, sessionId } = req.body; // items: [{productId, quantity, warehouseId?}]
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Items array required' });
    }

    const reservations = [];

    for (const item of items) {
      const { productId, quantity, warehouseId } = item;

      // Fetch product
      const product = await Product.findByPk(productId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: `Product ${productId} not found` });
      }

      // Multi-warehouse allocation logic
      if (warehouseId) {
        // Specific warehouse requested
        const warehouseStock = await WarehouseStock.findOne({
          where: { productId, warehouseId },
          transaction
        });

        const available = warehouseStock ? (warehouseStock.quantity - warehouseStock.reserved) : 0;
        if (available < quantity) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock in warehouse ${warehouseId} for product "${product.name}". Available: ${available}, Requested: ${quantity}`
          });
        }

        // Update warehouse stock reserved count
        await warehouseStock.update({
          reserved: warehouseStock.reserved + quantity
        }, { transaction });

      } else {
        // Auto-allocate from available warehouses (FIFO or priority logic)
        const warehouseStocks = await WarehouseStock.findAll({
          where: { productId },
          order: [['quantity', 'DESC']], // Allocate from highest stock first
          transaction
        });

        let remaining = quantity;
        const allocations = [];

        for (const ws of warehouseStocks) {
          const available = ws.quantity - ws.reserved;
          if (available > 0) {
            const allocate = Math.min(available, remaining);
            allocations.push({ warehouseId: ws.warehouseId, quantity: allocate });
            await ws.update({ reserved: ws.reserved + allocate }, { transaction });
            remaining -= allocate;
            if (remaining === 0) break;
          }
        }

        if (remaining > 0) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient total warehouse stock for product "${product.name}". Short by ${remaining} units.`
          });
        }
      }

      // Check main product stock (for single-warehouse or legacy logic)
      if (product.stock < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product "${product.name}". Available: ${product.stock}, Requested: ${quantity}`
        });
      }

      // Create reservation
      const reservation = await StockReservation.create({
        productId,
        userId,
        quantity,
        warehouseId: warehouseId || null,
        sessionId: sessionId || `SESSION-${Date.now()}`,
        status: 'active',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      }, { transaction });

      reservations.push(reservation);

      // Audit log
      await StockAuditLog.create({
        productId,
        warehouseId: warehouseId || null,
        changeType: 'reservation',
        quantityBefore: product.stock,
        quantityChange: -quantity,
        quantityAfter: product.stock, // Not actually reducing yet
        userId,
        reason: `Stock reserved for checkout session ${sessionId || reservation.sessionId}`
      }, { transaction });
    }

    await transaction.commit();
    emitToUser(userId, 'inventory:reservation', {
      action: 'reserved',
      reservationCount: reservations.length,
      sessionId: sessionId || reservations[0]?.sessionId
    });
    emitRealtimeUpdate('inventory', {
      userId,
      adminOnly: true,
      action: 'stock_reserved',
      reservationCount: reservations.length
    });
    res.json({ success: true, reservations });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in reserveStock:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const releaseReservation = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { sessionId, reservationId } = req.body;
    const userId = req.user.id;

    const where = reservationId ? { id: reservationId, userId } : { sessionId, userId };
    const reservations = await StockReservation.findAll({ where: { ...where, status: 'active' }, transaction });

    if (reservations.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'No active reservations found' });
    }

    for (const reservation of reservations) {
      // Release warehouse reserved count
      if (reservation.warehouseId) {
        const warehouseStock = await WarehouseStock.findOne({
          where: { productId: reservation.productId, warehouseId: reservation.warehouseId },
          transaction
        });
        if (warehouseStock) {
          await warehouseStock.update({
            reserved: Math.max(0, warehouseStock.reserved - reservation.quantity)
          }, { transaction });
        }
      }

      // Mark as cancelled
      await reservation.update({
        status: 'cancelled',
        releasedAt: new Date()
      }, { transaction });

      // Audit log
      await StockAuditLog.create({
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        changeType: 'reservation_release',
        quantityBefore: 0,
        quantityChange: reservation.quantity,
        quantityAfter: 0,
        userId,
        reason: 'Reservation cancelled by user'
      }, { transaction });
    }

    await transaction.commit();
    emitToUser(userId, 'inventory:reservation', { action: 'released', count: reservations.length, sessionId: sessionId || null });
    emitRealtimeUpdate('inventory', { userId, adminOnly: true, action: 'stock_released', count: reservations.length });
    res.json({ success: true, message: `Released ${reservations.length} reservation(s)` });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in releaseReservation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Cleanup expired reservations (called by cron)
const cleanupExpiredReservations = async () => {
  const transaction = await sequelize.transaction();
  try {
    const expired = await StockReservation.findAll({
      where: {
        status: 'active',
        expiresAt: { [Op.lt]: new Date() }
      },
      transaction
    });

    for (const reservation of expired) {
      // Release warehouse reserved count
      if (reservation.warehouseId) {
        const warehouseStock = await WarehouseStock.findOne({
          where: { productId: reservation.productId, warehouseId: reservation.warehouseId },
          transaction
        });
        if (warehouseStock) {
          await warehouseStock.update({
            reserved: Math.max(0, warehouseStock.reserved - reservation.quantity)
          }, { transaction });
        }
      }

      await reservation.update({
        status: 'expired',
        releasedAt: new Date()
      }, { transaction });

      await StockAuditLog.create({
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        changeType: 'reservation_release',
        quantityBefore: 0,
        quantityChange: reservation.quantity,
        quantityAfter: 0,
        reason: 'Reservation expired automatically'
      }, { transaction });
    }

    await transaction.commit();
    emitRealtimeUpdate('inventory', { adminOnly: true, action: 'expired_reservations_released', count: expired.length });
    console.log(`✅ Released ${expired.length} expired stock reservations`);
  } catch (error) {
    await transaction.rollback();
    console.error('Error in cleanupExpiredReservations:', error);
  }
};

// Restock notification system
const checkLowStockAndNotify = async () => {
  try {
    // Check main product stock
    const lowStockProducts = await Product.findAll({
      where: {
        stock: { [Op.lte]: sequelize.col('lowStockThreshold') },
        status: 'active'
      },
      include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email', 'businessName'] }]
    });

    // Check warehouse-specific stock
    const lowWarehouseStocks = await WarehouseStock.findAll({
      where: {
        quantity: { [Op.lte]: sequelize.col('reorderPoint') }
      },
      include: [
        { model: Product, attributes: ['id', 'name', 'sellerId'] },
        { model: Warehouse, attributes: ['id', 'name', 'town'] }
      ]
    });

    // Notify sellers about main stock
    for (const product of lowStockProducts) {
      const seller = product.seller;
      if (seller) {
        await Notification.create({
          userId: seller.id,
          type: 'stock_alert',
          title: 'Low Stock Alert',
          message: `Product "${product.name}" is running low. Current stock: ${product.stock}, Threshold: ${product.lowStockThreshold}`,
          data: JSON.stringify({ productId: product.id, stock: product.stock, threshold: product.lowStockThreshold })
        });
      }
    }

    // Notify about warehouse stock (to admins/warehouse managers)
    const admins = await User.findAll({ where: { role: { [Op.in]: ['superadmin', 'admin'] } } });
    for (const ws of lowWarehouseStocks) {
      for (const admin of admins) {
        await Notification.create({
          userId: admin.id,
          type: 'warehouse_stock_alert',
          title: 'Warehouse Low Stock Alert',
          message: `Product "${ws.Product.name}" at ${ws.Warehouse.name} is below reorder point. Quantity: ${ws.quantity}, Reorder Point: ${ws.reorderPoint}`,
          data: JSON.stringify({
            productId: ws.productId,
            warehouseId: ws.warehouseId,
            quantity: ws.quantity,
            reorderPoint: ws.reorderPoint
          })
        });
      }
    }

    console.log(`✅ Low stock check complete. Notified for ${lowStockProducts.length} products and ${lowWarehouseStocks.length} warehouse items.`);
  } catch (error) {
    console.error('Error in checkLowStockAndNotify:', error);
  }
};

// Manual stock adjustment
const adjustStock = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { productId, warehouseId, quantityChange, reason, changeType } = req.body;
    const userId = req.user.id;

    if (!productId || quantityChange === undefined) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'productId and quantityChange required' });
    }

    const product = await Product.findByPk(productId, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const quantityBefore = product.stock;
    const quantityAfter = quantityBefore + quantityChange;

    if (quantityAfter < 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Cannot reduce stock below zero' });
    }

    // Update main product stock
    await product.update({ stock: quantityAfter }, { transaction });

    // Update warehouse stock if specified
    if (warehouseId) {
      const [warehouseStock] = await WarehouseStock.findOrCreate({
        where: { productId, warehouseId },
        defaults: { quantity: 0, reserved: 0 },
        transaction
      });

      await warehouseStock.update({
        quantity: Math.max(0, warehouseStock.quantity + quantityChange),
        lastRestockedAt: quantityChange > 0 ? new Date() : warehouseStock.lastRestockedAt,
        lastRestockedBy: quantityChange > 0 ? userId : warehouseStock.lastRestockedBy
      }, { transaction });
    }

    // Audit log
    await StockAuditLog.create({
      productId,
      warehouseId: warehouseId || null,
      changeType: changeType || 'adjustment',
      quantityBefore,
      quantityChange,
      quantityAfter,
      userId,
      reason: reason || 'Manual stock adjustment'
    }, { transaction });

    await transaction.commit();
    emitToAdmins('inventory:stock:adjusted', { productId, warehouseId: warehouseId || null, quantityBefore, quantityAfter });
    emitRealtimeUpdate('inventory', {
      adminOnly: true,
      sellerId: product.sellerId || null,
      action: 'stock_adjusted',
      productId,
      warehouseId: warehouseId || null,
      quantityAfter
    });
    res.json({ success: true, message: 'Stock adjusted successfully', quantityBefore, quantityAfter });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in adjustStock:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Bulk stock import
const bulkStockImport = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items } = req.body; // items: [{productId or sku, quantity, warehouseId?, reason?}]
    const userId = req.user.id;

    if (!items || !Array.isArray(items)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Items array required' });
    }

    const results = { success: [], failed: [] };

    for (const item of items) {
      try {
        const { productId, sku, quantity, warehouseId, reason } = item;

        // Find product by ID or SKU
        const where = productId ? { id: productId } : sku ? { sku } : null;
        if (!where) {
          results.failed.push({ item, error: 'productId or sku required' });
          continue;
        }

        const product = await Product.findOne({ where, transaction });
        if (!product) {
          results.failed.push({ item, error: 'Product not found' });
          continue;
        }

        const quantityBefore = product.stock;
        const quantityAfter = quantityBefore + quantity;

        // Update product stock
        await product.update({ stock: quantityAfter }, { transaction });

        // Update warehouse stock if specified
        if (warehouseId) {
          const [warehouseStock] = await WarehouseStock.findOrCreate({
            where: { productId: product.id, warehouseId },
            defaults: { quantity: 0, reserved: 0 },
            transaction
          });

          await warehouseStock.update({
            quantity: warehouseStock.quantity + quantity,
            lastRestockedAt: new Date(),
            lastRestockedBy: userId
          }, { transaction });
        }

        // Audit log
        await StockAuditLog.create({
          productId: product.id,
          warehouseId: warehouseId || null,
          changeType: 'bulk_import',
          quantityBefore,
          quantityChange: quantity,
          quantityAfter,
          userId,
          reason: reason || 'Bulk import operation',
          metadata: { originalItem: item }
        }, { transaction });

        results.success.push({ productId: product.id, name: product.name, quantityBefore, quantityAfter });
      } catch (itemError) {
        results.failed.push({ item, error: itemError.message });
      }
    }

    await transaction.commit();
    emitToAdmins('inventory:bulk:import', {
      successCount: results.success.length,
      failedCount: results.failed.length
    });
    emitRealtimeUpdate('inventory', {
      adminOnly: true,
      action: 'bulk_import_completed',
      successCount: results.success.length,
      failedCount: results.failed.length
    });
    res.json({
      success: true,
      message: `Bulk import complete. Success: ${results.success.length}, Failed: ${results.failed.length}`,
      results
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error in bulkStockImport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Bulk stock export (CSV-ready format)
const bulkStockExport = async (req, res) => {
  try {
    const { warehouseId } = req.query;

    let stockData;

    if (warehouseId) {
      // Export warehouse-specific stock
      stockData = await WarehouseStock.findAll({
        where: { warehouseId },
        include: [
          { model: Product, attributes: ['id', 'name', 'sku', 'price', 'lowStockThreshold'] },
          { model: Warehouse, attributes: ['name', 'town'] }
        ]
      });

      const exportData = stockData.map(ws => ({
        productId: ws.Product.id,
        productName: ws.Product.name,
        sku: ws.Product.sku,
        warehouse: ws.Warehouse.name,
        location: ws.Warehouse.town || 'N/A',
        quantity: ws.quantity,
        reserved: ws.reserved,
        available: ws.quantity - ws.reserved,
        reorderPoint: ws.reorderPoint,
        lastRestockedAt: ws.lastRestockedAt
      }));

      return res.json({ success: true, data: exportData });
    } else {
      // Export all products with main stock
      stockData = await Product.findAll({
        attributes: ['id', 'name', 'sku', 'stock', 'lowStockThreshold', 'price', 'status'],
        include: [{ model: User, as: 'seller', attributes: ['name', 'email', 'businessName'] }]
      });

      const exportData = stockData.map(p => ({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        price: p.price,
        status: p.status,
        sellerName: p.seller?.name,
        sellerEmail: p.seller?.email
      }));

      return res.json({ success: true, data: exportData });
    }
  } catch (error) {
    console.error('Error in bulkStockExport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Stock audit trail
const getStockAuditTrail = async (req, res) => {
  try {
    const { productId, warehouseId, changeType, startDate, endDate, limit = 100 } = req.query;

    const where = {};
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (changeType) where.changeType = changeType;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const auditLogs = await StockAuditLog.findAll({
      where,
      include: [
        { model: Product, attributes: ['id', 'name', 'sku'] },
        { model: Warehouse, attributes: ['name', 'town'] },
        { model: User, attributes: ['name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    res.json({ success: true, auditLogs });
  } catch (error) {
    console.error('Error in getStockAuditTrail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  reserveStock,
  releaseReservation,
  cleanupExpiredReservations,
  checkLowStockAndNotify,
  adjustStock,
  bulkStockImport,
  bulkStockExport,
  getStockAuditTrail
};
