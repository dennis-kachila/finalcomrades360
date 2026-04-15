const { sequelize, Sequelize } = require('../database/database');

// Initialize all models
const User = require('./User')(sequelize, Sequelize.DataTypes);
const Product = require('./Product')(sequelize, Sequelize.DataTypes);
const Category = require('./Category')(sequelize, Sequelize.DataTypes);
const Subcategory = require('./Subcategory')(sequelize, Sequelize.DataTypes);
const RoleApplication = require('./RoleApplication')(sequelize, Sequelize.DataTypes);
const Order = require('./Order')(sequelize, Sequelize.DataTypes);
const OrderItem = require('./OrderItem')(sequelize, Sequelize.DataTypes);
const Cart = require('./Cart')(sequelize, Sequelize.DataTypes);
const CartItem = require('./CartItem')(sequelize, Sequelize.DataTypes);
const Notification = require('./Notification')(sequelize, Sequelize.DataTypes);
const Commission = require('./Commission')(sequelize, Sequelize.DataTypes);
const Referral = require('./Referral')(sequelize, Sequelize.DataTypes);
const ReferralTracking = require('./ReferralTracking')(sequelize, Sequelize.DataTypes);
const MarketingAnalytics = require('./MarketingAnalytics')(sequelize, Sequelize.DataTypes);
const DeliveryAgentProfile = require('./DeliveryAgentProfile')(sequelize, Sequelize.DataTypes);
const HeroPromotion = require('./HeroPromotion')(sequelize, Sequelize.DataTypes);
const PasswordReset = require('./PasswordReset')(sequelize, Sequelize.DataTypes);
const Wishlist = require('./Wishlist')(sequelize, Sequelize.DataTypes);
const Payment = require('./Payment')(sequelize, Sequelize.DataTypes);
const ProductVariant = require('./ProductVariant')(sequelize, Sequelize.DataTypes);
const Transaction = require('./Transaction')(sequelize, Sequelize.DataTypes);
const UserRole = require('./UserRole')(sequelize, Sequelize.DataTypes);
const Wallet = require('./Wallet')(sequelize, Sequelize.DataTypes);
const SocialMediaAccount = require('./SocialMediaAccount')(sequelize, Sequelize.DataTypes);
const Service = require('./Service')(sequelize, Sequelize.DataTypes);
const ServiceImage = require('./ServiceImage')(sequelize, Sequelize.DataTypes);
const ProductDeletionRequest = require('./ProductDeletionRequest')(sequelize, Sequelize.DataTypes);
const DeletedProduct = require('./DeletedProduct')(sequelize, Sequelize.DataTypes);
const ProductInquiry = require('./ProductInquiry')(sequelize, Sequelize.DataTypes);
const ProductInquiryReply = require('./ProductInquiryReply')(sequelize, Sequelize.DataTypes);
const ProductView = require('./ProductView')(sequelize, Sequelize.DataTypes);
const FastFood = require('./FastFood')(sequelize, Sequelize.DataTypes);
const PlatformConfig = require('./PlatformConfig')(sequelize, Sequelize.DataTypes);
const PlatformWallet = require('./PlatformWallet')(sequelize, Sequelize.DataTypes);
const PlatformTransaction = require('./PlatformTransaction')(sequelize, Sequelize.DataTypes);
const LoginHistory = require('./LoginHistory')(sequelize, Sequelize.DataTypes);
const Role = require('./Role')(sequelize, Sequelize.DataTypes);
const DeliveryMessage = require('./DeliveryMessage')(sequelize, Sequelize.DataTypes);
const JobOpening = require('./JobOpening')(sequelize, Sequelize.DataTypes);
const DeliveryTask = require('./DeliveryTask')(sequelize, Sequelize.DataTypes);
const DeliveryCharge = require('./DeliveryCharge')(sequelize, Sequelize.DataTypes);
const Warehouse = require('./Warehouse')(sequelize, Sequelize.DataTypes);
const PickupStation = require('./PickupStation')(sequelize, Sequelize.DataTypes);
const FastFoodReview = require('./FastFoodReview')(sequelize, Sequelize.DataTypes);
const StockReservation = require('./StockReservation')(sequelize, Sequelize.DataTypes);
const StockAuditLog = require('./StockAuditLog')(sequelize, Sequelize.DataTypes);
const WarehouseStock = require('./WarehouseStock')(sequelize, Sequelize.DataTypes);
const PaymentRetryQueue = require('./PaymentRetryQueue')(sequelize, Sequelize.DataTypes);
const PaymentReconciliation = require('./PaymentReconciliation')(sequelize, Sequelize.DataTypes);
const Refund = require('./Refund')(sequelize, Sequelize.DataTypes);
const PaymentDispute = require('./PaymentDispute')(sequelize, Sequelize.DataTypes);
const ReturnRequest = require('./ReturnRequest')(sequelize, Sequelize.DataTypes);
const Batch = require('./Batch')(sequelize, Sequelize.DataTypes);
const FastFoodPickupPoint = require('./FastFoodPickupPoint')(sequelize, Sequelize.DataTypes);
const HandoverCode = require('./HandoverCode')(sequelize, Sequelize.DataTypes);
const Otp = require('./Otp')(sequelize, Sequelize.DataTypes);
const ContactMessage = require('./ContactMessage')(sequelize, Sequelize.DataTypes);
const ContactReply = require('./ContactReply')(sequelize, Sequelize.DataTypes);

const models = {
  User,
  Product,
  Category,
  Subcategory,
  ProductDeletionRequest,
  DeletedProduct,
  ProductInquiry,
  RoleApplication,
  Order,
  OrderItem,
  Cart,
  CartItem,
  Notification,
  Commission,
  Referral,
  ReferralTracking,
  MarketingAnalytics,
  DeliveryAgentProfile,
  HeroPromotion,
  PasswordReset,
  Wishlist,
  Payment,
  ProductVariant,
  ProductView,
  Transaction,
  UserRole,
  Wallet,
  SocialMediaAccount,
  Service,
  ServiceImage,
  FastFood,
  PlatformConfig,
  PlatformWallet,
  PlatformTransaction,
  LoginHistory,
  Role,
  JobOpening,
  DeliveryTask,
  DeliveryCharge,
  Warehouse,
  PickupStation,
  DeliveryMessage,
  FastFoodReview,
  StockReservation,
  StockAuditLog,
  WarehouseStock,
  PaymentRetryQueue,
  PaymentReconciliation,
  Refund,
  PaymentDispute,
  ReturnRequest,
  Batch,
  FastFoodPickupPoint,
  HandoverCode,
  Otp,
  ContactMessage,
  ContactReply,
  ProductInquiryReply
};

// Set up associations
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

// Re-export all models for easy access
module.exports = {
  User,
  Product,
  Category,
  Subcategory,
  ProductDeletionRequest,
  DeletedProduct,
  ProductInquiry,
  ProductInquiryReply,
  RoleApplication,
  Order,
  OrderItem,
  Cart,
  CartItem,
  Notification,
  Commission,
  Referral,
  ReferralTracking,
  MarketingAnalytics,
  DeliveryAgentProfile,
  HeroPromotion,
  PasswordReset,
  Wishlist,
  Payment,
  ProductVariant,
  ProductView,
  Transaction,
  UserRole,
  Wallet,
  SocialMediaAccount,
  Service,
  ServiceImage,
  FastFood,
  PlatformConfig,
  PlatformWallet,
  PlatformTransaction,
  LoginHistory,
  Role,
  JobOpening,
  DeliveryTask,
  DeliveryCharge,
  Warehouse,
  PickupStation,
  DeliveryMessage,
  FastFoodReview,
  StockReservation,
  StockAuditLog,
  WarehouseStock,
  PaymentRetryQueue,
  PaymentReconciliation,
  Refund,
  PaymentDispute,
  ReturnRequest,
  Batch,
  FastFoodPickupPoint,
  HandoverCode,
  Otp,
  ContactMessage,
  ContactReply,
  sequelize,
  Sequelize,
  Op: Sequelize.Op
};
