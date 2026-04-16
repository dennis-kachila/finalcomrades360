const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Service } = require('./models');

const UPLOADS_ROOT = path.join(__dirname, 'uploads', 'services');
if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

const IMAGE_MAPPING = {
  'Professional House Cleaning': 'https://images.unsplash.com/photo-1581578731548-c64695ce6958?auto=format&fit=crop&w=800&q=80',
  'Mathematics & Science Tutor': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80',
  'Smartphone & Screen Repair': 'https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?auto=format&fit=crop&w=800&q=80',
  'Wedding & Event Photography': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
  'Manicure & Pedicure Session': 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80',
  'Plumbing & Pipe Fixing': 'https://images.unsplash.com/photo-1581242163695-19d0acfd486f?auto=format&fit=crop&w=800&q=80',
  'Laundry & Ironing Service': 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=800&q=80',
  'Guitar & Piano Lessons': 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80',
  'Graphic Design & Branding': 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80',
  'Computer Software Install': 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
  'Home Massage Therapy': 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80',
  'Baby & Kids Photoshoot': 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
  'Personal Gym Trainer': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80',
  'Electrical Wiring Fix': 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
  'Car Detailing & Wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=800&q=80'
};

async function downloadImage(url, targetPath) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(targetPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (err) {
    console.error(`Failed to download ${url}: ${err.message}`);
  }
}

async function run() {
  const services = await Service.findAll();
  console.log(`🚀 Processing ${services.length} services...`);

  for (const s of services) {
    const url = IMAGE_MAPPING[s.title];
    if (url) {
      const fileName = `service_${s.id}.webp`;
      const targetPath = path.join(UPLOADS_ROOT, fileName);
      const dbPath = `/uploads/services/${fileName}`;

      console.log(`Downloading for: ${s.title}...`);
      await downloadImage(url, targetPath);
      
      await s.update({ coverImage: dbPath });
      console.log(`Updated DB path to: ${dbPath}`);
    } else {
      console.warn(`No mapping for: ${s.title}`);
    }
  }

  console.log('✨ Done!');
  process.exit(0);
}

run();
