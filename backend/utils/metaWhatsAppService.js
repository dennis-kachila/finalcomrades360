const axios = require('axios');

/**
 * Send WhatsApp message using the Official Meta Cloud API (Graph API)
 * 
 * @param {string} to - Recipient phone number in E.164 format (e.g., 254712345678)
 * @param {string} message - Content of the message
 * @param {Object} config - Configuration object from PlatformConfig
 * @returns {Promise<Object>} - Response from Meta API
 */
const sendWhatsAppCloud = async (to, message, config) => {
    const { metaAccessToken, metaPhoneNumberId } = config;

    if (!metaAccessToken || !metaPhoneNumberId) {
        console.error('❌ [Meta WhatsApp] Missing credentials (accessToken or phoneNumberId)');
        throw new Error('WhatsApp Cloud API credentials are not configured.');
    }

    // Clean phone number (remove +, spaces, etc)
    let cleanedPhone = to.replace(/[\s\-\(\)\+]/g, '');
    
    // Ensure 254 format if starting with 07 or 01 (Kenya specific example, can be adjusted)
    if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '254' + cleanedPhone.substring(1);
    }

    const url = `https://graph.facebook.com/v17.0/${metaPhoneNumberId}/messages`;

    try {
        console.log(`[Meta WhatsApp] Sending message to ${cleanedPhone}...`);
        
        const response = await axios.post(
            url,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanedPhone,
                type: 'text',
                text: { 
                    preview_url: false,
                    body: message 
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${metaAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ [Meta WhatsApp] Message sent successfully:', response.data.messages[0].id);
        return { success: true, messageId: response.data.messages[0].id, data: response.data };
    } catch (error) {
        const errorDetail = error.response?.data?.error?.message || error.message;
        console.error('❌ [Meta WhatsApp] API Error:', errorDetail);
        
        // Check for specific Meta errors
        if (error.response?.data?.error?.code === 131030) {
            throw new Error('WhatsApp Meta API: Recipient phone number is not in your allow-list (if using a test number).');
        }
        
        throw new Error(`WhatsApp Meta API Error: ${errorDetail}`);
    }
};

module.exports = { sendWhatsAppCloud };
