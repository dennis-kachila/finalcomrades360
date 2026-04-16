// Polyfill for Node.js v18 and below
if (!global.crypto) {
    global.crypto = require('crypto');
}

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const africastalking = require('africastalking');
const { sendWhatsAppCloud } = require('./metaWhatsAppService');
const fs = require('fs');
const path = require('path');

// State management
let sock = null;
let isWhatsAppReady = false;
let latestQr = null;
let whatsappStatus = 'initializing'; // initializing, qr_ready, authenticated, ready, disconnected, error

// Prepare session directory (using absolute path for cPanel/Passenger stability)
const sessionDir = path.join(__dirname, '../.wwebjs_auth/baileys_session');
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

// Helper to log errors to a file on the server
const logWhatsApp = (msg) => {
    const logPath = path.join(__dirname, '../whatsapp_engine.log');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(logPath, line); } catch (e) {}
    console.log(`[WhatsApp JS] ${msg}`);
};

const initWhatsApp = async () => {
    logWhatsApp('STARTING: initWhatsApp triggered');
    // 1. Fetch config from DB
    let method = 'local';
    try {
        const { PlatformConfig } = require('../models');
        const configRecord = await PlatformConfig.findOne({ where: { key: 'whatsapp_config' } });
        if (configRecord) {
            const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
            method = dbConfig.method || 'local';
        }
    } catch (err) {
        logWhatsApp(`CONFIG ERROR: ${err.message}`);
    }

    // 2. Guard: skip if explicitly disabled or set to cloud
    const isEnabled = process.env.WHATSAPP_ENABLED !== 'false'; // Default to true if missing
    if (!isEnabled || method === 'cloud') {
        whatsappStatus = method === 'cloud' ? 'cloud_active' : 'disabled';
        logWhatsApp(`SKIPPING: method=${method}, enabled=${isEnabled}`);
        return;
    }

    logWhatsApp('INIT: Starting Baileys Socket...');
    whatsappStatus = 'initializing';
    latestQr = null;

    try {
        logWhatsApp(`SESSION: Using ${sessionDir}`);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        logWhatsApp('VERSION: Fetching latest...');
        const { version } = await fetchLatestBaileysVersion();
        logWhatsApp(`SOCKET: Initializing (Version ${version.join('.')})...`);

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
            },
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: ['Comrades360', 'MacOS', '3.0']
        });

        // Event: Connection Update (QR and Status)
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logWhatsApp('EVENT: QR Code Generated!');
                latestQr = qr;
                whatsappStatus = 'qr_ready';
            }

            if (connection === 'connecting') {
                logWhatsApp('EVENT: Connecting...');
                whatsappStatus = 'initializing';
            }

            if (connection === 'open') {
                logWhatsApp('EVENT: Ready & Connected!');
                isWhatsAppReady = true;
                whatsappStatus = 'ready';
                latestQr = null;
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                logWhatsApp(`EVENT: Closed (shouldReconnect=${shouldReconnect})`);
                isWhatsAppReady = false;
                whatsappStatus = 'disconnected';
                
                if (shouldReconnect) {
                    setTimeout(initWhatsApp, 5000);
                }
            }
        });

        // Event: Save Credentials
        sock.ev.on('creds.update', () => {
            logWhatsApp('EVENT: Credentials Updated/Saved');
            saveCreds();
        });

    } catch (err) {
        logWhatsApp(`FATAL ERROR: ${err.message}`);
        whatsappStatus = 'error';
        isWhatsAppReady = false;
        sock = null;
    }
};

// Auto-start
if (process.env.WHATSAPP_ENABLED !== 'false') {
    initWhatsApp();
} else {
    whatsappStatus = 'disabled';
}

/**
 * Public control functions
 */
const getWhatsAppStatus = () => {
    return {
        isReady: isWhatsAppReady,
        status: whatsappStatus,
        qr: latestQr
    };
};

const restartWhatsApp = async () => {
    console.log('🔄 [WhatsApp] Manual restart requested...');
    isWhatsAppReady = false;
    latestQr = null;
    if (sock) {
        try { sock.logout(); } catch (e) {}
    }
    setTimeout(initWhatsApp, 1000);
    return { success: true };
};

const sendMessage = async (to, message, method = 'whatsapp') => {
    if (method === 'whatsapp') {
        try {
            const { PlatformConfig } = require('../models');
            const configRecord = await PlatformConfig.findOne({ where: { key: 'whatsapp_config' } });
            if (configRecord) {
                const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
                if (dbConfig.method === 'cloud') {
                    return sendWhatsAppCloud(to, message, dbConfig);
                }
            }
        } catch (err) {}
        return sendWhatsAppLocal(to, message);
    } else {
        return sendSms(to, message);
    }
};

const sendWhatsAppLocal = async (to, message) => {
    if (!isWhatsAppReady || !sock) {
        throw new Error('WhatsApp service is not ready. Please scan the QR code first.');
    }

    try {
        let cleanedPhone = to.replace(/[\s\-\(\)\+]/g, '');
        if (cleanedPhone.startsWith('0')) {
            cleanedPhone = '254' + cleanedPhone.substring(1);
        }
        
        const jid = `${cleanedPhone}@s.whatsapp.net`;
        console.log(`[Baileys WhatsApp] Sending to: ${jid}...`);
        
        const result = await sock.sendMessage(jid, { text: message });
        console.log('✅ [Baileys WhatsApp] Message sent successfully!');
        return { success: true, messageId: result.key.id };
    } catch (error) {
        console.error('❌ [Baileys WhatsApp] Error:', error.message);
        throw error;
    }
};

const sendSms = async (to, message) => {
    let username = (process.env.AFRICASTALKING_USERNAME || '').trim();
    let apiKey = (process.env.AFRICASTALKING_API_KEY || '').trim();

    try {
        const { PlatformConfig } = require('../models');
        const configRecord = await PlatformConfig.findOne({ where: { key: 'sms_config' } });
        if (configRecord) {
            const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
            if (dbConfig.username) username = dbConfig.username.trim();
            if (dbConfig.apiKey) apiKey = dbConfig.apiKey.trim();
        }
    } catch (err) {}

    if (!username || !apiKey) {
        console.log(`[MOCK SMS] To: ${to}, Message: ${message}`);
        return { success: true, mock: true };
    }

    const at = africastalking({ username, apiKey });
    try {
        const result = await at.SMS.send({ to: [to], message, enqueue: true });
        console.log('✅ [SMS] Sent:', JSON.stringify(result));
        return { success: true, data: result };
    } catch (error) {
        console.error('❌ [SMS] Error:', error);
        throw error;
    }
};

module.exports = { sendMessage, getWhatsAppStatus, restartWhatsApp };
