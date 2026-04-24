// Polyfill for Node.js v18 and below
if (!global.crypto) {
    global.crypto = require('crypto');
}

let baileys;

async function getBaileys() {
    if (!baileys) {
        baileys = await import('@whiskeysockets/baileys');
    }
    return baileys;
}

const P = require('pino');
const africastalking = require('africastalking');
const { sendWhatsAppCloud } = require('./metaWhatsAppService');
const fs = require('fs');
const path = require('path');

// State management
let sock = null;
let isWhatsAppReady = false;
let latestQr = null;
let isInitializing = false;
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
    // Mirror to console.error for immediate visibility in cPanel stderr.log
    console.error(`[WhatsApp JS] ${msg}`);
};

const initWhatsApp = async () => {
    if (isInitializing) {
        logWhatsApp('⚠️ SKIPPING: initWhatsApp already in progress.');
        return;
    }
    isInitializing = true;
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
    const isEnabled = process.env.WHATSAPP_ENABLED !== 'false'; 
    if (!isEnabled || method === 'cloud') {
        whatsappStatus = method === 'cloud' ? 'cloud_active' : 'disabled';
        logWhatsApp(`SKIPPING: method=${method}, enabled=${isEnabled}`);
        isInitializing = false; // Reset flag so it can be re-triggered manually if needed
        return;
    }

    logWhatsApp('INIT: Starting Baileys Socket...');
    whatsappStatus = 'initializing';
    latestQr = null;

    try {
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            fetchLatestBaileysVersion, 
            makeCacheableSignalKeyStore,
            DisconnectReason
        } = await getBaileys();

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
                isInitializing = false;
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                logWhatsApp(`EVENT: Closed (shouldReconnect=${shouldReconnect})`);
                isWhatsAppReady = false;
                whatsappStatus = 'disconnected';
                isInitializing = false;
                
                // Use a more conservative backoff for reconnection to avoid pool exhaustion
                if (shouldReconnect) {
                    const delay = 30000; // Increase to 30s
                    logWhatsApp(`RETRY: Reconnecting in ${delay/1000}s...`);
                    setTimeout(() => {
                        if (!isWhatsAppReady && !isInitializing) {
                            initWhatsApp();
                        }
                    }, delay); 
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
        isInitializing = false;
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
    logWhatsApp('🔄 RESTART: Soft restart (reconnect) requested...');
    isWhatsAppReady = false;
    latestQr = null;
    if (sock) {
        try { 
            // End the socket abruptly so it tries to reconnect 
            // if we don't null it out, or we can null it and re-init.
            sock.end(new Error('Manual Reconnect Requested')); 
        } catch (e) {
            logWhatsApp(`RESTART ERROR: ${e.message}`);
        }
    }
    // Re-initialize after a short delay
    setTimeout(initWhatsApp, 1000);
    return { success: true };
};

const logoutWhatsApp = async () => {
    logWhatsApp('🚪 LOGOUT: Hard logout requested (clearing session)...');
    isWhatsAppReady = false;
    latestQr = null;
    if (sock) {
        try { 
            await sock.logout(); 
            sock = null;
        } catch (e) {
            logWhatsApp(`LOGOUT ERROR: ${e.message}`);
        }
    }
    
    // Explicitly clear session directory to be sure
    try {
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            fs.mkdirSync(sessionDir, { recursive: true });
        }
    } catch (e) {
        logWhatsApp(`CLEANUP ERROR: ${e.message}`);
    }

    setTimeout(initWhatsApp, 2000);
    return { success: true };
};

/**
 * Normalizes phone numbers to E.164 format for WhatsApp and SMS (Kenyan focus)
 */
const normalizePhone = (phone) => {
    let clean = String(phone || '').replace(/[\s\-\(\)\+]/g, '');
    if (clean.startsWith('0')) {
        clean = '254' + clean.substring(1);
    }
    // Prefix with + if not already present for international standard
    return clean.startsWith('254') ? `+${clean}` : `+${clean}`;
};

const sendMessage = async (to, message, method = 'whatsapp') => {
    const formattedPhone = normalizePhone(to);
    console.log(`[Messaging] 🚀 ROUTING: ${method.toUpperCase()} | TARGET: ${formattedPhone}`);

    if (method === 'whatsapp') {
        try {
            const { PlatformConfig } = require('../models');
            const configRecord = await PlatformConfig.findOne({ where: { key: 'whatsapp_config' } });
            if (configRecord) {
                const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
                if (dbConfig.method === 'cloud') {
                    return sendWhatsAppCloud(formattedPhone, message, dbConfig);
                }
            }
        } catch (err) {
            logWhatsApp(`ERROR in sendMessage (cloud-check): ${err.message}`);
        }
        return sendWhatsAppLocal(formattedPhone, message);
    } else {
        return sendSms(formattedPhone, message);
    }
};

const sendWhatsAppLocal = async (to, message) => {
    if (!isWhatsAppReady || !sock) {
        throw new Error('WhatsApp service is not ready. Please scan the QR code first.');
    }

    try {
        const jid = `${to.replace('+', '')}@s.whatsapp.net`;
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
    // 1. Check Dashboard (Database) Settings first
    let username = '';
    let apiKey = '';
    let from = '';

    try {
        const { PlatformConfig } = require('../models');
        const configRecord = await PlatformConfig.findOne({ where: { key: 'sms_config' } });
        if (configRecord) {
            const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
            username = (dbConfig.username || '').trim();
            apiKey = (dbConfig.apiKey || '').trim();
            from = (dbConfig.senderId || dbConfig.from || '').trim();
        }
    } catch (err) {
        console.error('[SMS Service] Failed to fetch database config:', err.message);
    }

    // 2. Fallback to .env if Database is empty
    if (!username) username = (process.env.AFRICASTALKING_USERNAME || '').trim();
    if (!apiKey) apiKey = (process.env.AFRICASTALKING_API_KEY || '').trim();
    if (!from) from = (process.env.AFRICASTALKING_FROM || '').trim();

    // 3. Fallback to Mock if still empty
    if (!username || !apiKey) {
        console.log(`⚠️ [SMS MOCK] Credentials missing. To: ${to}, Message: ${message}`);
        return { success: true, mock: true };
    }

    const at = africastalking({ username, apiKey });
    try {
        console.log(`[Africatalking SMS] Dispatching to: ${to} (Sender: ${from || 'Default'})...`);
        
        const options = { 
            to: [to], 
            message, 
            enqueue: true 
        };
        
        // Only add 'from' if it's explicitly set to avoid AT errors with empty strings
        if (from) options.from = from;

        const result = await at.SMS.send(options);
        
        console.log('✅ [SMS] Africatalking Response:', JSON.stringify(result, null, 2));

        const recipients = result?.SMSMessageData?.Recipients || [];
        const failed = recipients.filter(r => r.status !== 'Success' && r.status !== 'Enqueued');
        
        if (failed.length > 0) {
            console.error('❌ [SMS] Delivery Failure for some recipients:', JSON.stringify(failed));
        }

        return { success: true, data: result };
    } catch (error) {
        console.error('❌ [SMS] Africatalking FATAL Error:', error);
        if (error.response) {
            console.error('❌ [SMS] Error Data:', error.response.data);
        }
        throw error;
    }
};

module.exports = { sendMessage, getWhatsAppStatus, restartWhatsApp, logoutWhatsApp };
