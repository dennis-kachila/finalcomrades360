const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { FastFood } = require('../models');

async function getOptimizedImage(url, destPath) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        const buffer = Buffer.from(response.data);
        const optimized = await sharp(buffer)
            .resize(800)
            .webp({ quality: 80 })
            .toBuffer();
        fs.writeFileSync(destPath, optimized);
        return true;
    } catch (e) {
        console.error(`Failed to process image ${url}: ${e.message}`);
        return false;
    }
}

const fixData = [
    { name: 'Beef Samosas (Pair)', url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=800&auto=format&fit=crop' },
    { name: 'Masala Chips', url: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?q=80&w=800&auto=format&fit=crop' },
    { name: 'Rolled Chapatis (2pcs)', url: 'https://images.unsplash.com/photo-1596797038530-2c39bb91f942?q=80&w=800&auto=format&fit=crop' }
];

async function fix() {
    for (const item of fixData) {
        const filename = `${item.name.replace(/\s+/g, '_').toLowerCase()}.webp`;
        const uploadPath = path.join(__dirname, '../public/uploads/other', filename);
        if (await getOptimizedImage(item.url, uploadPath)) {
            await FastFood.update({ mainImage: `/uploads/other/${filename}` }, { where: { name: item.name } });
            console.log(`Fixed image for ${item.name}`);
        }
    }
    process.exit(0);
}

fix();
