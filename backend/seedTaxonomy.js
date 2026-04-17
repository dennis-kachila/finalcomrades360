const { Category, Subcategory } = require('./models');

const taxonomy = [
  {
    name: 'Electronics & Appliances',
    emoji: '📱',
    taxonomyType: 'product',
    subcategories: [
      { name: 'Smartphones & Tablets', emoji: '📱' },
      { name: 'Laptops & Computing', emoji: '💻' },
      { name: 'Television & Audio', emoji: '📺' },
      { name: 'Kitchen Appliances', emoji: '🍳' },
      { name: 'Smart Home & Security', emoji: '🏠' }
    ]
  },
  {
    name: 'Fashion & Design',
    emoji: '👗',
    taxonomyType: 'product',
    subcategories: [
      { name: "Men's Clothing", emoji: '👕' },
      { name: "Women's Clothing", emoji: '👗' },
      { name: 'Shoes & Footwear', emoji: '👟' },
      { name: 'Watches & Jewelry', emoji: '⌚' },
      { name: 'Bags & Accessories', emoji: '🎒' }
    ]
  },
  {
    name: 'Food & Drinks',
    emoji: '🍕',
    taxonomyType: 'fast_food',
    subcategories: [
      { name: 'Fast Food & Meals', emoji: '🍔' },
      { name: 'Beverages & Soft Drinks', emoji: '🥤' },
      { name: 'Alcoholic Drinks', emoji: '🍷' },
      { name: 'Bakery & Pastries', emoji: '🥐' },
      { name: 'Groceries & Supplies', emoji: '🛒' }
    ]
  },
  {
    name: 'Services & Bookings',
    emoji: '🛠️',
    taxonomyType: 'service',
    subcategories: [
      { name: 'Beauty & Hair Styling', emoji: '💇' },
      { name: 'Repair & Maintenance', emoji: '🔧' },
      { name: 'Cleaning & Laundry', emoji: '🧼' },
      { name: 'Photography & Video', emoji: '📷' },
      { name: 'Tutors & Lessons', emoji: '📚' }
    ]
  },
  {
    name: 'Home & Living',
    emoji: '🏠',
    taxonomyType: 'product',
    subcategories: [
      { name: 'Furniture', emoji: '🛋️' },
      { name: 'Bedding & Bath', emoji: '🛏️' },
      { name: 'Home Decor', emoji: '🖼️' },
      { name: 'Lighting', emoji: '💡' },
      { name: 'Garden & Outdoor', emoji: '🌳' }
    ]
  },
  {
    name: 'Health & Beauty',
    emoji: '🧴',
    taxonomyType: 'product',
    subcategories: [
      { name: 'Skin Care', emoji: '🧴' },
      { name: 'Makeup & Cosmetics', emoji: '💄' },
      { name: 'Fragrances', emoji: '✨' },
      { name: 'Hair Care', emoji: '✂️' },
      { name: 'Personal Wellness', emoji: '🧘' }
    ]
  },
  {
    name: 'Supermarket & Supplies',
    emoji: '🛒',
    taxonomyType: 'product',
    subcategories: [
      { name: 'Canned Foods & Pasta', emoji: '🍝' },
      { name: 'Household Cleaning', emoji: '🧽' },
      { name: 'Personal Care', emoji: '🪒' },
      { name: 'Baby Supplies', emoji: '🍼' },
      { name: 'Breakfast & Snacks', emoji: '🍪' }
    ]
  },
  {
    name: 'Sports & Fitness',
    emoji: '⚽',
    taxonomyType: 'product',
    subcategories: [
      { name: 'Gym Equipment', emoji: '🏋️' },
      { name: 'Outdoor & Camping', emoji: '🏕️' },
      { name: 'Team Sports Gear', emoji: '⚽' },
      { name: 'Cycling & Scooters', emoji: '🚲' },
      { name: 'Swimming Accessories', emoji: '🏊' }
    ]
  },
  {
    name: 'Baby & Kids',
    emoji: '🧸',
    taxonomyType: 'product',
    subcategories: [
      { name: "Kids' Toys", emoji: '🧸' },
      { name: 'Baby Clothing', emoji: '🍼' },
      { name: 'Strollers & Carry', emoji: '🛒' },
      { name: 'Nursery Furniture', emoji: '🛏️' },
      { name: 'School Supplies', emoji: '🎒' }
    ]
  }
];

async function seed() {
  console.log('🌱 Starting category seeding...');
  
  for (const catData of taxonomy) {
    try {
      // Create or find category
      const slug = catData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const [category, created] = await Category.findOrCreate({
        where: { name: catData.name },
        defaults: {
          emoji: catData.emoji,
          slug,
          taxonomyType: catData.taxonomyType,
          isActive: true
        }
      });
      
      // If category already exists, update its taxonomyType
      if (!created) {
        await category.update({ taxonomyType: catData.taxonomyType });
        console.log(`✅ Updated Category: ${catData.name} (${catData.taxonomyType})`);
      } else {
        console.log(`✅ Created Category: ${catData.name} (${catData.taxonomyType})`);
      }
      
      // Create subcategories
      for (const subData of catData.subcategories) {
        const subSlug = subData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await Subcategory.findOrCreate({
          where: { 
            name: subData.name,
            categoryId: category.id
          },
          defaults: {
            emoji: subData.emoji,
            slug: subSlug,
            isActive: true
          }
        });
        console.log(`   - Subcategory: ${subData.name}`);
      }
    } catch (error) {
      console.error(`❌ Error seeding ${catData.name}:`, error.message);
    }
  }
  
  console.log('🏁 Seeding complete!');
  process.exit(0);
}

seed();
