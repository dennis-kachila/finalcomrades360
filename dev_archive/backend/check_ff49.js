const { FastFood } = require('./models/index');

async function checkFF49() {
    try {
        const ff = await FastFood.findByPk(49);
        console.log('--- FastFood 49 Details ---');
        console.log(JSON.stringify(ff, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkFF49();
