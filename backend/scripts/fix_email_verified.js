const { sequelize, User } = require('../models');
const { Op } = require('sequelize');

async function fix() {
  try {
    await sequelize.authenticate();
    // Update users who have an email that doesn't start with 'noemail_' to be verified
    // We are doing this because they likely completed the verification but the bug prevented the flag.
    const [updatedRows] = await User.update(
      { emailVerified: true },
      { 
        where: { 
          email: { [Op.and]: [{ [Op.notLike]: 'noemail_%' }, { [Op.ne]: null }, { [Op.ne]: '' }] },
          emailVerified: false
        } 
      }
    );
    console.log(`Successfully fixed emailVerified flag for ${updatedRows} users.`);
  } catch (err) {
    console.error('Error fixing db:', err);
  } finally {
    process.exit();
  }
}
fix();
