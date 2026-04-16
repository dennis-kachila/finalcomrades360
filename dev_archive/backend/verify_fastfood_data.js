const { FastFood } = require('./models');

async function verifyData() {
  const item = await FastFood.findByPk(4);
  
  console.log('Testing frontend data parsing:\n');
  console.log('Raw sizeVariants type:', typeof item.sizeVariants);
  
  const sv = typeof item.sizeVariants === 'string' 
    ? JSON.parse(item.sizeVariants) 
    : item.sizeVariants;
  
  console.log('Parsed variants:', sv.length, 'items');
  sv.forEach(v => {
    console.log(`  - ${v.name}: basePrice=${v.basePrice}, displayPrice=${v.displayPrice}, price=${v.price}`);
  });
  
  console.log('\nRaw comboOptions type:', typeof item.comboOptions);
  
  const co = typeof item.comboOptions === 'string' 
    ? JSON.parse(item.comboOptions) 
    : item.comboOptions;
  
  console.log('Parsed combos:', co.length, 'items');
  co.forEach(c => {
    console.log(`  - ${c.name}: price=${c.price}`);
    console.log(`    Items: ${c.items.join(', ')}`);
  });
  
  process.exit(0);
}

verifyData().catch(e => {
  console.error(e);
  process.exit(1);
});
