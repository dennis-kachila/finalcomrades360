const { sequelize } = require('./models');
const { DataTypes } = require('sequelize');

async function fixUserSchema() {
    console.log('🚀 Starting User Table Schema Fix...');
    const queryInterface = sequelize.getQueryInterface();

    const addColumnSafely = async (tableName, columnName, definition) => {
        try {
            const tableDefinition = await queryInterface.describeTable(tableName);
            if (tableDefinition[columnName]) {
                console.log(`⚠️ Column '${columnName}' already exists in '${tableName}'. Skipping...`);
                return;
            }
            await queryInterface.addColumn(tableName, columnName, definition);
            console.log(`✅ Column '${columnName}' added successfully to '${tableName}'.`);
        } catch (error) {
            console.error(`❌ Error adding column '${columnName}' to '${tableName}':`, error.message);
        }
    };

    try {
        // 1. Suspension Fields
        await addColumnSafely('User', 'suspendedRoles', {
            type: DataTypes.JSON,
            defaultValue: [],
            allowNull: true
        });

        await addColumnSafely('User', 'isMarketerSuspended', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        await addColumnSafely('User', 'isSellerSuspended', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        await addColumnSafely('User', 'isDeliverySuspended', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        // 2. Security Fields
        await addColumnSafely('User', 'mustChangePassword', {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        });

        // 3. Ensure other recent fields exist (just in case)
        await addColumnSafely('User', 'businessName', {
            type: DataTypes.STRING,
            allowNull: true
        });

        await addColumnSafely('User', 'dashboardPassword', {
            type: DataTypes.STRING,
            allowNull: true
        });

        console.log('✨ User table schema fix completed!');
    } catch (error) {
        console.error('💥 Critical failure during schema fix:', error);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

fixUserSchema();
