const { DataTypes } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const SiteVisit = sequelize.define("SiteVisit", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    ipAddress: { type: DataTypes.STRING },
    userAgent: { type: DataTypes.TEXT },
    path: { type: DataTypes.STRING, allowNull: false },
    referrer: { type: DataTypes.STRING }, // external referrer
    sessionId: { type: DataTypes.STRING },
    deviceType: { type: DataTypes.STRING }, // 'mobile', 'desktop', 'tablet'
    browser: { type: DataTypes.STRING },
    os: { type: DataTypes.STRING },
    location: { type: DataTypes.STRING },
    isUnique: { type: DataTypes.BOOLEAN, defaultValue: false } // whether this was the first visit in the session
  }, {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['path'] },
      { fields: ['sessionId'] }
    ]
  });

  // Define associations
  SiteVisit.associate = (models) => {
    SiteVisit.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return SiteVisit;
};
