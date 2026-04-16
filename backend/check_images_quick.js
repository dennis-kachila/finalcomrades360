const { Sequelize } = require('sequelize');
const s = new Sequelize('sqlite:./database.sqlite', { logging: false });
s.query("SELECT name FROM sqlite_master WHERE type='table'", { type: Sequelize.QueryTypes.SELECT })
  .then(r => {
    console.log('Tables:', r.map(x => x.name).join(', '));
    return s.query("SELECT id, name, coverImage, images FROM Product LIMIT 5", { type: Sequelize.QueryTypes.SELECT });
  })
  .then(rows => {
    console.log('\nSample products:');
    rows.forEach(p => {
      console.log(`  [${p.id}] ${p.name}`);
      console.log(`    coverImage: ${p.coverImage}`);
      console.log(`    images: ${p.images}`);
    });
    s.close();
  })
  .catch(e => {
    console.error('Error:', e.message);
    s.close();
  });
