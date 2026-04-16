const fs = require('fs');
const path = require('path');
const { Product } = require('./models');

async function debug() {
    try {
        const products = await Product.findAll({
            where: {
                coverImage: { [require('sequelize').Op.like]: '/uploads/%' }
            },
            attributes: ['id', 'name', 'coverImage']
        });

        console.log(`Checking ${products.length} products with file paths...`);

        products.forEach(p => {
            const relativePath = p.coverImage.replace(/^\//, ''); // remove leading slash
            const absolutePath = path.join(__dirname, relativePath);
            const exists = fs.existsSync(absolutePath);
            console.log(`${p.name} (ID: ${p.id}): ${p.coverImage} -> Exists: ${exists}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

debug();
