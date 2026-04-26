const { User } = require('./models');
const dotenv = require('dotenv');
const path = require('path');
const { Op } = require('sequelize');

/**
 * PERMANENT USER DELETION SCRIPT
 * This script connects to the production database and HARD DELETES users.
 * Recovery is NOT possible after running this.
 */

// Load production environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

async function hardDeleteUsers() {
    // ==========================================
    // ⚠️ EDIT THESE VALUES BEFORE RUNNING
    // ==========================================
    const userIdsToRemove = []; // e.g. [10, 11]
    const emailsToRemove = [];  // e.g. ['test@example.com']
    // ==========================================

    if (userIdsToRemove.length === 0 && emailsToRemove.length === 0) {
        console.error('❌ ABORTED: No IDs or Emails specified. Please edit the script first.');
        process.exit(1);
    }

    try {
        console.log('⚠️ WARNING: Starting PERMANENT deletion...');
        
        const count = await User.destroy({
            where: {
                [Op.or]: [
                    { id: userIdsToRemove },
                    { email: emailsToRemove }
                ]
            },
            force: true // <--- THIS MAKES IT PERMANENT (HARD DELETE)
        });

        console.log(`✅ SUCCESS: Permanently removed ${count} users from the database.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ FATAL ERROR:', error.message);
        process.exit(1);
    }
}

hardDeleteUsers();
