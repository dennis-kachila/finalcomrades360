const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'backend', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log(`Checking ${files.length} route files...`);

for (const file of files) {
    const filePath = path.join(routesDir, file);
    try {
        require(filePath);
        // console.log(`✅ ${file} is OK`);
    } catch (err) {
        if (err.message.includes('Invalid or unexpected token') || err.name === 'SyntaxError') {
            console.error(`❌ ERROR in ${file}: ${err.message}`);
            console.error(err.stack);
        }
    }
}
