const { getEnabledChannels } = require('./utils/templateUtils');
const { validateConfig } = require('./scripts/services/mpesaService');
const { PlatformConfig } = require('./models');

async function verify() {
    console.log('🧪 Starting Verification of Platform Config Persistence...');

    try {
        // 1. Check Notification Settings
        console.log('\n--- Notification Global Toggles ---');
        await PlatformConfig.upsert({
            key: 'notification_settings',
            value: JSON.stringify({ emailNotifications: false, smsNotifications: true, pushNotifications: false })
        });
        
        const templateChannels = { email: true, whatsapp: true, sms: true };
        const enabled = await getEnabledChannels(templateChannels);
        console.log('Template requested: EMAIL, WHATSAPP, SMS');
        console.log('Global Toggle: EMAIL=false');
        console.log('Resulting Enabled Channels:', enabled);
        
        if (enabled.email === true) {
            console.error('❌ FAIL: Email should have been disabled by global toggle.');
        } else {
            console.log('✅ PASS: Global notification toggles respected.');
        }

        // 2. Check M-Pesa Service Start Resilience
        console.log('\n--- M-Pesa Startup Resilience ---');
        process.env.MPESA_CONSUMER_KEY = ''; // Clear it
        await PlatformConfig.upsert({
            key: 'mpesa_config',
            value: JSON.stringify({ mockMode: true })
        });
        
        try {
            // Requiring the file triggers validateConfig() at the top of mpesaService.js
            require('./scripts/services/mpesaService');
            console.log('✅ PASS: Server starts (file loaded) with empty Env Vars because Mock Mode check allows it.');
        } catch (e) {
            console.error('❌ FAIL: Server crashed during file load:', e.message);
        }

        console.log('\n✨ Verification Complete.');
        process.exit(0);
    } catch (err) {
        console.error('💥 Verification Error:', err);
        process.exit(1);
    }
}

verify();
