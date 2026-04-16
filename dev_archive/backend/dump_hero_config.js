const { PlatformConfig } = require('./models');

async function dumpConfig() {
    try {
        const config = await PlatformConfig.findOne({
            where: { key: 'fast_food_hero' }
        });
        if (config) {
            console.log('--- Platform Config: fast_food_hero ---');
            console.log(config.value);
            console.log('---------------------------------------');
        } else {
            console.log('fast_food_hero config not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

dumpConfig();
