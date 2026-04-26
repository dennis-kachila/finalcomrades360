const { Product, FastFood, Service, User } = require('./models');

async function fixOrphanedData() {
  try {
    console.log('🔍 Checking for orphaned products, fast foods, and services...');
    
    // Find a valid super admin to assign orphaned items to
    const superAdmin = await User.findOne({ where: { role: 'superadmin' } });
    if (!superAdmin) {
      console.log('❌ No superadmin found to reassign to!');
      return;
    }
    
    const validAdminId = superAdmin.id;
    console.log(`✅ Found valid SuperAdmin (ID: ${validAdminId}) to adopt orphaned items.`);

    // Get all valid user IDs
    const users = await User.findAll({ attributes: ['id'] });
    const validUserIds = new Set(users.map(u => u.id));

    // 1. Fix Products
    const products = await Product.findAll();
    let fixedProducts = 0;
    for (const p of products) {
      if (!validUserIds.has(p.sellerId)) {
        await p.update({ sellerId: validAdminId });
        fixedProducts++;
      }
    }
    console.log(`🛠️ Fixed ${fixedProducts} orphaned products.`);

    // 2. Fix FastFoods
    const fastfoods = await FastFood.findAll();
    let fixedFastfoods = 0;
    for (const f of fastfoods) {
      if (!validUserIds.has(f.restaurantId)) {
        await f.update({ restaurantId: validAdminId });
        fixedFastfoods++;
      }
    }
    console.log(`🛠️ Fixed ${fixedFastfoods} orphaned fast foods.`);

    // 3. Fix Services
    const services = await Service.findAll();
    let fixedServices = 0;
    for (const s of services) {
      if (!validUserIds.has(s.providerId)) {
        await s.update({ providerId: validAdminId });
        fixedServices++;
      }
    }
    console.log(`🛠️ Fixed ${fixedServices} orphaned services.`);

    console.log('🎉 Database cleanup complete! Your checkout should now work perfectly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing orphaned data:', error);
    process.exit(1);
  }
}

fixOrphanedData();
