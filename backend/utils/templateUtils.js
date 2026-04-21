const { PlatformConfig } = require('../models');

/**
 * Helper to fetch a template from the database or fallback to default
 */
async function getDynamicMessage(key, defaultTemplate, data = {}) {
    try {
        const configRecord = await PlatformConfig.findOne({ where: { key: 'whatsapp_config' } });
        let template = defaultTemplate;
        
        if (configRecord) {
            const dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
            template = dbConfig.templates?.[key] || defaultTemplate;
        }

        // Replace placeholders
        let result = String(template || "");
        for (const [k, v] of Object.entries(data)) {
            // Ensure v is a string and handle null/undefined/objects
            const replacement = (v === null || v === undefined) ? "" : String(v);
            result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), replacement);
        }
        return result;
    } catch (err) {
        console.warn(`⚠️ [TemplateUtils] Failed to load template ${key}:`, err.message);
        return defaultTemplate;
    }
}

async function getEnabledChannels(templateKey) {
    const fallback = { whatsapp: true, sms: true, email: true, in_app: true };
    try {
        const [whatsappConfigRecord, notificationSettingsRecord] = await Promise.all([
            PlatformConfig.findOne({ where: { key: 'whatsapp_config' } }),
            PlatformConfig.findOne({ where: { key: 'notification_settings' } })
        ]);

        let channels = fallback;

        // 1. Load template-specific channels from whatsapp_config
        if (whatsappConfigRecord) {
            const dbConfig = typeof whatsappConfigRecord.value === 'string' ? JSON.parse(whatsappConfigRecord.value) : whatsappConfigRecord.value;
            channels = dbConfig.channels?.[templateKey] || fallback;
        }

        // 2. Overlay global notification_settings (High priority overrides)
        if (notificationSettingsRecord) {
            const settings = typeof notificationSettingsRecord.value === 'string' ? JSON.parse(notificationSettingsRecord.value) : notificationSettingsRecord.value;
            
            // Global Order Confirmation Toggle
            if (['orderPlaced', 'sellerConfirmed', 'orderInTransit', 'orderReadyPickup', 'orderDelivered'].includes(templateKey)) {
                if (settings.orderConfirmations === false) {
                    return { whatsapp: false, sms: false, email: false, in_app: false };
                }
            }

            // Global Channel Toggles
            if (settings.emailNotifications === false) channels.email = false;
            if (settings.smsNotifications === false) {
                channels.sms = false;
                channels.whatsapp = false; // Usually grouped under phone notifications in UI
            }
        }

        return channels;
    } catch (err) {
        console.warn(`⚠️ [TemplateUtils] Failed to load channels for ${templateKey}:`, err.message);
        return fallback;
    }
}

module.exports = { getDynamicMessage, getEnabledChannels };
