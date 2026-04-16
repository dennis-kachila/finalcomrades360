const { sequelize } = require('./database/database');

async function checkType() {
    try {
        const [results] = await sequelize.query("SELECT id, typeof(sellerId), sellerId FROM Orders WHERE id = 207");
        console.log('--- Database Type Check for Order 207 ---');
        console.log(JSON.stringify(results, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkType();
