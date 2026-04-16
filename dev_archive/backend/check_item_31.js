const { FastFood } = require('./models');

async function checkItem31() {
    try {
        const item = await FastFood.findByPk(31);
        if (item) {
            console.log('--- Item 31 ---');
            console.log(JSON.stringify(item, null, 2));
            console.log('----------------');
        } else {
            console.log('Item 31 not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkItem31();
