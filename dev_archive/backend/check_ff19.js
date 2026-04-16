const { FastFood } = require('./models/index');

async function checkFF19() {
    try {
        const ff = await FastFood.findByPk(19);
        console.log('--- FastFood 19 Details ---');
        console.log(JSON.stringify(ff, null, 2));
    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkFF19();
