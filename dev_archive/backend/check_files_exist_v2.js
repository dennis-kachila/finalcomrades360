const fs = require('fs');
const path = require('path');
const { Product } = require('./models');

async function debug() {
    try {
        const p = await Product.findByPk(154);
        if (!p) {
            console.log('Product 154 not found');
            return;
        }

        console.log('Product 154 details:');
        console.log('Name:', p.name);
        console.log('coverImage:', p.coverImage);
        console.log('Type of coverImage:', typeof p.coverImage);
        if (p.coverImage) {
            console.log('Starts with /uploads/:', p.coverImage.startsWith('/uploads/'));
        }

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

debug();
