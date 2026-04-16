const { Product } = require('./models/index');

async function check() {
    try {
        const products = await Product.findAll({
            limit: 10,
            order: [['createdAt', 'DESC']]
        });

        products.forEach(p => {
            console.log(`PROD: ${p.name} (ID: ${p.id})`);
            console.log(`  COVER: ${p.coverImage}`);
            console.log(`  IMAGES: ${JSON.stringify(p.images)}`);
        });
    } catch (e) {
        console.error(e.message);
    } finally {
        process.exit();
    }
}

check();
