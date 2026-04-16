const { Product } = require('./models/index');
const fs = require('fs');

async function check() {
    try {
        const products = await Product.findAll({
            limit: 20,
            order: [['createdAt', 'DESC']]
        });

        let output = '';
        products.forEach(p => {
            output += `PROD: ${p.name} (ID: ${p.id})\n`;
            output += `  COVER: ${p.coverImage}\n`;
            output += `  IMAGES: ${JSON.stringify(p.images)}\n`;
            output += `  GALLERY: ${JSON.stringify(p.galleryImages)}\n`;
            output += `-------------------\n`;
        });
        fs.writeFileSync('product_dump.txt', output);
        console.log('Dumped to product_dump.txt');
    } catch (e) {
        console.error(e.message);
    } finally {
        process.exit();
    }
}

check();
