const { DataTypes, Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model { }

  User.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false  // auto-generated from email/phone if not provided
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,  // placeholder used if user registers with phone only
      unique: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,  // placeholder used if user registers with email only
      unique: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    dashboardPassword: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Secondary password for role-based dashboard access'
    },
    publicId: {
      type: DataTypes.STRING,
      unique: true
    },
    role: {
      type: DataTypes.STRING,
      defaultValue: 'customer',
      // No FK reference — 'customer' is the implied default state for all users,
      // not a formal role that needs to exist in the Roles table.
    },
    roles: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of all approved elevated roles for this user (customer is implied and not listed)'
    },
    referralCode: {
      type: DataTypes.STRING,
      unique: true
    },
    referredByReferralCode: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Referral code used during registration for marketing tracking'
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'General account verification status - used for role applicants (set true when application approved)'
    },

    applicationStatus: {
      type: DataTypes.ENUM('none', 'pending', 'approved', 'rejected'),
      defaultValue: 'none'
    },
    deletionRequested: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    isDeactivated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    suspendedRoles: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of roles that are suspended for this user (e.g., ["marketer", "seller"])'
    },
    isMarketerSuspended: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'DEPRECATED: Use suspendedRoles instead.'
    },
    isSellerSuspended: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'DEPRECATED: Use suspendedRoles instead.'
    },
    isDeliverySuspended: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'DEPRECATED: Use suspendedRoles instead.'
    },
    isFrozen: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // 2FA fields
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    twoFactorSecret: {
      type: DataTypes.STRING,
      allowNull: true
    },
    twoFactorRecoveryCodes: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    twoFactorBackupCodes: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    // Pending verification fields
    pendingEmail: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emailChangeToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emailChangeExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    pendingPhone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phoneOtp: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phoneOtpExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Address fields for delivery
    county: {
      type: DataTypes.STRING,
      allowNull: true
    },
    town: {
      type: DataTypes.STRING,
      allowNull: true
    },
    estate: {
      type: DataTypes.STRING,
      allowNull: true
    },
    houseNumber: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Seller business location fields (for pickup/delivery)
    businessName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Seller business/store name'
    },
    businessAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Seller business/store physical address'
    },
    businessCounty: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Business location county'
    },
    businessTown: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Business location town/city'
    },
    businessLandmark: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Nearby landmark for business location'
    },
    businessPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Business contact phone (may differ from personal phone)'
    },
    businessLat: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      comment: 'Latitude for seller business location calculation'
    },
    businessLng: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      comment: 'Longitude for seller business location calculation'
    },
    // Personal information fields
    gender: {
      type: DataTypes.ENUM('male', 'female', 'other'),
      allowNull: true
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    campus: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Verification fields
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    phoneVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    nationalIdUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    nationalIdStatus: {
      type: DataTypes.ENUM('none', 'pending', 'approved', 'rejected'),
      defaultValue: 'none'
    },
    nationalIdRejectionReason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    nationalIdNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'National ID number provided by user/admin during verification'
    },
    // Access control
    accessRestrictions: {
      type: DataTypes.JSON,
      defaultValue: {
        marketplace: true,
        sellerPortal: false,
        marketingTools: false,
        commissionAccess: false,
        adminPanel: false
      }
    },
    // Ban/deactivation reason
    banReason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Additional verification fields
    emailVerificationToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phoneVerificationCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Last login tracking
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true
    },
    profileImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profileVisibility: {
      type: DataTypes.ENUM('public', 'private'),
      defaultValue: 'public'
    },
    walletBalance: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    loyaltyPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    sequelize,
    timestamps: true,
    paranoid: true, // Enable Soft Deletes
    modelName: 'User',
    tableName: 'User',  // Explicitly set to match the actual table name in the database
  });

  // Returns true if the user meets all verification criteria
  User.isVerifiedCriteriaMet = function (user) {
    const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(user.role) ||
      (user.roles && user.roles.some(r => ['admin', 'superadmin', 'super_admin'].includes(r)));

    if (isAdmin) return true;

    return !!(user.emailVerified && user.phoneVerified && user.nationalIdStatus === 'approved');
  };

  /**
   * Returns true if a seller has provided all required business location fields.
   * Required fields: businessAddress, businessCounty, businessTown, businessLandmark, businessPhone, businessLat, businessLng
   */
  User.isSellerProfileComplete = function (user) {
    if (!user) return false;
    
    const requiredFields = [
      'businessName',
      'businessAddress',
      'businessCounty',
      'businessTown',
      'businessLandmark',
      'businessPhone',
      'businessLat',
      'businessLng'
    ];

    return requiredFields.every(field => {
      const val = user[field];
      if (val === undefined || val === null) return false;
      if (typeof val === 'string') return val.trim().length > 0;
      return true; // Numbers like Lat/Lng are already checked for null/undefined
    });
  };

  // Instance method to recalculate and save isVerified status
  User.prototype.recalculateIsVerified = async function () {
    const shouldBeVerified = User.isVerifiedCriteriaMet(this);
    if (this.isVerified !== shouldBeVerified) {
      this.isVerified = shouldBeVerified;
      await this.save({ fields: ['isVerified'] });
      return true;
    }
    return false;
  };

  // Define associations
  User.associate = function (models) {
    // A user can have many role applications
    User.hasMany(models.RoleApplication, {
      foreignKey: 'userId',
      as: 'roleApplications'
    });

    // A user can be a reviewer of role applications
    User.hasMany(models.RoleApplication, {
      foreignKey: 'reviewedBy',
      as: 'reviewedApplications'
    });

    // A user has many notifications
    User.hasMany(models.Notification, {
      foreignKey: 'userId',
      as: 'notifications'
    });

    // A user can have many social media accounts (via referralCode)
    User.hasMany(models.SocialMediaAccount, {
      foreignKey: 'userReferralCode',
      sourceKey: 'referralCode',
      as: 'socialMediaAccounts'
    });

    // A user can have many roles
    User.hasMany(models.UserRole, {
      foreignKey: 'userId',
      as: 'userRoles'
    });

    // A user has many login history records
    User.hasMany(models.LoginHistory, {
      foreignKey: 'userId',
      as: 'loginHistory'
    });

    // A delivery agent user has a delivery profile
    User.hasOne(models.DeliveryAgentProfile, {
      foreignKey: 'userId',
      as: 'deliveryProfile'
    });

    // A user has one wallet
    User.hasOne(models.Wallet, {
      foreignKey: 'userId',
      as: 'wallet'
    });

    // Bidirectional associations for Products
    User.hasMany(models.Product, {
      foreignKey: 'sellerId',
      as: 'products'
    });

    User.hasMany(models.Product, {
      foreignKey: 'addedBy',
      as: 'addedProducts'
    });

    // Bidirectional associations for FastFood and Services
    User.hasMany(models.FastFood, {
      foreignKey: 'vendor',
      as: 'vendorProducts'
    });

    User.hasMany(models.Service, {
      foreignKey: 'userId',
      as: 'providedServices'
    });
  };

  return User;
};
