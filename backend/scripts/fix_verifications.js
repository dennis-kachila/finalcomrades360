const { User } = require('../models');
const { Op } = require('sequelize');

async function fix() {
  try {
    const emailResult = await User.update({ emailVerified: false }, { where: { email: { [Op.like]: 'noemail_%' } } });
    console.log(`Reset emailVerified for ${emailResult[0]} users.`);
    
    const phoneResult = await User.update({ phoneVerified: false }, { where: { phone: { [Op.like]: 'nophone_%' } } });
    console.log(`Reset phoneVerified for ${phoneResult[0]} users.`);
    
    console.log('Successfully fixed database verification states.');
  } catch (err) {
    console.error('Error fixing db:', err);
  } finally {
    process.exit();
  }
}
fix();
