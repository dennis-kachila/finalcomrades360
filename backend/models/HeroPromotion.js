const { DataTypes } = require('sequelize');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

module.exports = (sequelize, DataTypes) => {
  const HeroPromotion = sequelize.define('HeroPromotion', {
    sellerId: { type: DataTypes.INTEGER, allowNull: true }, // null for system promotions
    productIds: {
      type: DataTypes.TEXT, // JSON array of product IDs
      allowNull: true,
      get() {
        const raw = this.getDataValue('productIds')
        try { return JSON.parse(raw || '[]') } catch { return [] }
      },
      set(v) { this.setDataValue('productIds', JSON.stringify(v || [])) }
    },
    fastFoodIds: {
      type: DataTypes.TEXT, // JSON array of fastfood item IDs
      allowNull: true,
      get() {
        const raw = this.getDataValue('fastFoodIds')
        try { return JSON.parse(raw || '[]') } catch { return [] }
      },
      set(v) { this.setDataValue('fastFoodIds', JSON.stringify(v || [])) }
    },
    promoType: { type: DataTypes.STRING, allowNull: false, defaultValue: 'product' }, // 'product' or 'fastfood'
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending_payment' }, // pending_payment, under_review, approved, scheduled, active, rejected, cancelled, expired
    paymentStatus: { type: DataTypes.STRING, allowNull: false, defaultValue: 'unpaid' }, // unpaid, paid, refunded
    amount: { type: DataTypes.REAL, allowNull: false, defaultValue: 0 },
    durationDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
    slotsCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    startAt: { type: DataTypes.DATE, allowNull: true },
    endAt: { type: DataTypes.DATE, allowNull: true },
    approvedBy: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    paymentProofUrl: { type: DataTypes.TEXT, allowNull: true },
    title: { type: DataTypes.STRING, allowNull: true },
    subtitle: { type: DataTypes.STRING, allowNull: true },
    customImageUrl: { type: DataTypes.TEXT, allowNull: true },
    targetUrl: { type: DataTypes.TEXT, allowNull: true },
    isSystem: { type: DataTypes.BOOLEAN, defaultValue: false },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    priority: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { 
    timestamps: true,
    hooks: {
      afterSave: async () => { emitRealtimeUpdate('marketing'); },
      afterDestroy: async () => { emitRealtimeUpdate('marketing'); },
      afterBulkUpdate: async () => { emitRealtimeUpdate('marketing'); }
    }
  })

  return HeroPromotion;
};
