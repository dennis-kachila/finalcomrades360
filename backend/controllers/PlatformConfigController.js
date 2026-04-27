const { PlatformConfig } = require('../models');
const { emitRealtimeUpdate } = require('../utils/realtimeEmitter');

exports.getConfig = async (req, res) => {
    try {
        const { key } = req.params;
        
        // Define system defaults
        const defaults = {
            platform_settings: { siteName: 'Comrades360', siteDescription: 'Your trusted marketplace', contactEmail: 'admin@comrades360.com', supportPhone: '+254700000000', currency: 'KES', timezone: 'Africa/Nairobi' },
            mpesa_config: { consumerKey: '', consumerSecret: '', passkey: '', shortcode: '174379', stkTimeout: 60, mockMode: false },
            mpesa_manual_instructions: { paybill: '714888', accountNumber: '223052' },
            airtel_config: { clientId: '', clientSecret: '', callbackUrl: '' },
            sms_config: { username: '', apiKey: '', provider: 'africastalking' },
            whatsapp_config: { 
                method: 'local',
                metaAccessToken: '',
                metaPhoneNumberId: '',
                templates: {
                    orderPlaced: `Hello {name}, your order #{orderNumber} has been placed successfully! 🛍️\n\nItems:\n{itemsList}\n\nTotal: KES {total}\nPayment: {paymentMethod}\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryLocation}\n\nTrack your order here: {trackUrl}\n\nThank you for shopping with Comrades360!`,
                    sellerConfirmed: `Hello {name}, good news! 🥗\n\nYour order #{orderNumber} has been confirmed by {sellerName} and is now being prepared.\n\nWe will notify you as soon as it is handed over to our delivery agent.\n\nThank you for choosing Comrades360!`,
                    orderInTransit: `Your order #{orderNumber} is on its way! 🚚\n\nHello {name}, your package has been collected by {agentName} ({agentPhone}) and is in transit.\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryAddress}\n\nPlease stay reachable for a smooth delivery!`,
                    orderReadyPickup: `Your order #{orderNumber} is ready for collection! 📦\n\nHello {name}, your items have arrived at the pickup location and are ready for you.\n\nPickup Details:\nStation: {stationName}\nLocation: {stationLocation}\nContact: {stationPhone}\n\nSee you soon at Comrades360!`,
                    orderDelivered: 'Hi {name}, your order #{orderNumber} has been delivered. Thank you!',
                    deliveryUpdate: 'Hello, your order #{orderNumber} status has been updated to: {status}. {message}',
                    agentArrived: 'Your delivery agent {agentName} has arrived at your location! 📍 Please meet them to collect order #{orderNumber}.',
                    agentTaskAssigned: 'You have been assigned a new delivery task for order #{orderNumber}. Type: {deliveryType}',
                    agentTaskReassigned: 'A delivery task for order #{orderNumber} has been reassigned to you.',
                    adminTaskRejected: 'Delivery agent {agentName} rejected task for order #{orderNumber}. Reason: {reason}',
                    orderCancelled: `Order Notification: Cancellation ❌\n\nHello {name}, we regret to inform you that order #{orderNumber} has been cancelled.\n\nCancellation Details:\nReason: {reason}\n\nWe apologize for the inconvenience and hope to serve you again soon.`,
                    phoneVerification: 'Your Comrades360 verification OTP is {otp}. It expires in 10 minutes.',
                    passwordReset: 'Your Comrades360 password reset code is {otp}. It expires in {minutes} minutes.',
                    withdrawalStatus: 'Your withdrawal of KES {amount} has been processed successfully! 💰',
                    googleWelcome: `Welcome to Comrades360! 🌟\n\nHello {name}, you have successfully joined our community using Google.\n\nIf you ever want to log in without Google, your temporary password is:\n\n  {tempPassword}\n\nWe recommend changing this in your account settings after your first login.\n\nThank you for choosing Comrades360!`
                },
                channels: {
                    passwordReset: { whatsapp: false, sms: true, email: true, in_app: false }
                }
            },
            finance_settings: { 
                referralSplit: { primary: 0.6, secondary: 0.4 }, 
                minPayout: { seller: 1000, marketer: 500, delivery_agent: 200, station_manager: 500, warehouse_manager: 1000, service_provider: 500 },
                withdrawalTiers: [
                    { min: 0, max: 1000, fee: 30 },
                    { min: 1001, max: 5000, fee: 50 },
                    { min: 5001, max: 10000, fee: 100 },
                    { min: 10001, max: 1000000, fee: 150 }
                ]
            },
            logistic_settings: { warehouseHours: { open: '08:00', close: '20:00' }, autoCancelUnpaidHours: 24, deliveryFeeBuffer: 0, autoApproveRequests: false, autoDispatchOrders: false },
            security_settings: { sessionTimeout: 30, passwordMinLength: 8, twoFactorEnabled: false, loginAttempts: 5, ipWhitelist: [] },
            notification_settings: { emailNotifications: true, smsNotifications: true, pushNotifications: false, orderConfirmations: true, deliveryUpdates: true },
            seo_settings: { title: 'Comrades360', description: 'Student Marketplace', keywords: 'university, marketplace', socialLinks: { facebook: '', instagram: '', twitter: '' } },
            maintenance_settings: { 
                enabled: false, 
                message: 'System is currently under maintenance.',
                dashboards: {
                    admin: { enabled: false, message: 'Admin dashboard is maintenance.' },
                    seller: { enabled: false, message: 'Seller portal is maintenance.' },
                    marketer: { enabled: false, message: 'Marketer hub is maintenance.' },
                    delivery: { enabled: false, message: 'Delivery app is maintenance.' },
                    station: { enabled: false, message: 'Station management is maintenance.' },
                    ops: { enabled: false, message: 'Operations dashboard is maintenance.' },
                    logistics: { enabled: false, message: 'Logistics dashboard is maintenance.' },
                    finance: { enabled: false, message: 'Finance dashboard is maintenance.' },
                    provider: { enabled: false, message: 'Service provider portal is maintenance.' }
                },
                sections: {
                    products: { enabled: false, hideFromPublic: true },
                    services: { enabled: false, hideFromPublic: true },
                    fastfood: { enabled: false, hideFromPublic: true }
                }
            },
            system_env: { server: { port: 4000, nodeEnv: 'development', baseUrl: 'http://localhost:4000', apiUrl: '/api' }, app: { frontendUrl: 'http://localhost:3000', supportEmail: 'support@comrades360.com' }, database: { dialect: 'sqlite', storage: './database.sqlite' } },
            
            // Informational Page Templates (Original site content)
            content_page_about: `<h2>Our Story</h2><p>Comrades360 was founded by students, for students. We understand the unique challenges of campus life, from tight budgets to busy schedules. We saw a need for a unified platform where students could easily buy, sell, and discover goods and services securely within their campus ecosystem.</p><p>What started as an idea in a dorm room has evolved into a comprehensive digital marketplace. Our goal has always been simple: create a trusted environment where "comrades" can thrive together.</p><h2>Our Mission</h2><p>To build a seamless, secure, and vibrant digital marketplace that connects university students with local vendors, fellow student entrepreneurs, and essential services in real-time.</p><h2>Why Choose Us?</h2><ul><li><strong>Secure:</strong> Verified student and seller profiles ensure a trusted community.</li><li><strong>By Students:</strong> Tailored specifically to the needs and rhythms of university life.</li><li><strong>Fast:</strong> Ultra-fast delivery and real-time communication with sellers.</li></ul>`,
            
            content_page_contact: `<h2>Get In Touch</h2><p>Our support team is available from 8am to 8pm (EAT), Monday through Saturday. We strive to respond to all inquiries within 24 hours.</p><h3>Support Channels</h3><ul><li><strong>Email:</strong> support@comrades360.shop</li><li><strong>Phone:</strong> +254 757 588 395</li><li><strong>Location:</strong> University Way, Nairobi, Kenya</li></ul><p>For order-related inquiries, please include your Order ID for faster assistance.</p>`,
            
            content_page_terms: `<h2>1. Acceptance of Terms</h2><p>By accessing and using Comrades360, you accept and agree to be bound by the terms and provision of this agreement. In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services.</p><h2>2. Description of Service</h2><p>Comrades360 provides a marketplace platform ("Service") for university students to buy, sell, and discover goods and services. We act solely as a facilitator connecting buyers and sellers.</p><h2>3. User Conduct</h2><ul><li>You must be a current student or verified vendor to use certain active selling features.</li><li>You agree not to post false, inaccurate, misleading, or defamatory content.</li><li>You are responsible for maintaining the confidentiality of your account password.</li></ul><h2>4. Transactions between Users</h2><p>Comrades360 is not a party to the transactions between buyers and sellers. The actual contract for sale is directly between the buyer and seller.</p>`,
            
            content_page_privacy: `<h2>1. Information We Collect</h2><ul><li><strong>Personal Data:</strong> Name, student email address, phone number, and campus location.</li><li><strong>Transaction Data:</strong> Details about payments and items purchased.</li><li><strong>Usage Data:</strong> Information about how you interact with our platform.</li></ul><h2>2. How We Use Your Information</h2><p>We use the information we collect to facilitate marketplace transactions, verify student status, and send order updates.</p><h2>3. Data Sharing</h2><p>We share necessary information (like delivery location) with your delivery agent specifically to fulfill an order. We do not sell your personal data.</p>`,
            
            content_page_faq: `<h2>Buying</h2><h3>How do I make a purchase?</h3><p>Simply browse the marketplace, add items to your cart, and proceed to checkout. You can choose whether to pick up your order or have it delivered directly to your hostel.</p><h3>Are the sellers verified?</h3><p>Yes. All sellers must go through a student or vendor verification process before they can list items.</p><h2>Selling</h2><h3>How much does it cost to sell?</h3><p>Listing items is free! We only take a small commission when an item is successfully sold.</p><h3>How do I get paid?</h3><p>Funds are released into your Comrades360 Wallet once the item is delivered. You can withdraw to M-Pesa directly.</p>`,
            
            content_page_shipping: `<h2>1. Delivery Service</h2><p>We pride ourselves on an ultra-fast campus delivery network powered by student agents.</p><ul><li><strong>Campus Deliveries:</strong> Usually delivered within 1-2 hours.</li><li><strong>Fast Food:</strong> Prioritized and fulfilled within 20-45 minutes.</li></ul><h2>2. Return Policy</h2><ul><li><strong>Valid Returns:</strong> Request within 48 hours if item is not as described or damaged.</li><li><strong>Food Items:</strong> For safety reasons, fast food items cannot be returned.</li></ul>`,
            
            content_page_payments: `<h2>M-Pesa Express (STK Push)</h2><p>Simply select M-Pesa at checkout, enter your Safaricom number, and a prompt will appear on your phone to enter your PIN.</p><h2>Comrades360 Wallet</h2><p>Top up your internal wallet or use your earnings to pay for new purchases instantly. Zero transaction fees!</p><h2>Cash on Delivery (Limited)</h2><p>Only available for specific sellers who explicitly enable it for campus pickups.</p>`,
            
            content_page_size_guide: `<h2>Perfomance Sizing</h2><p>Sizes vary depending on the brand and the seller's source. Always read the seller's specific product description for exact measurements.</p><h2>Women's Sizing (General)</h2><ul><li><strong>Small (S):</strong> UK 8-10, Bust 32-34"</li><li><strong>Medium (M):</strong> UK 12-14, Bust 36-38"</li><li><strong>Large (L):</strong> UK 16, Bust 40"</li></ul><h2>Men's Sizing (General)</h2><ul><li><strong>Small (S):</strong> Chest 34-36", Waist 28-30"</li><li><strong>Medium (M):</strong> Chest 38-40", Waist 32-34"</li><li><strong>Large (L):</strong> Chest 42-44", Waist 36-38"</li></ul>`,
            
            content_page_help: `<h2>Need Help?</h2><p>If you're experiencing issues with an order or your account, please check our FAQ first. If you still need help, use one of the channels below:</p><ul><li><strong>Direct Support:</strong> Use the "Support & Tickets" section in your dashboard.</li><li><strong>WhatsApp:</strong> Reach us at +254 757 588 395 for quick queries.</li><li><strong>Email:</strong> support@comrades360.shop</li></ul>`,
        };

        const config = await PlatformConfig.findOne({ where: { key } });
        const baseDefaults = defaults[key] || {};

        if (!config) {
            return res.json({ success: true, data: baseDefaults, isDefault: true });
        }

        // Final result: Start with base defaults, overlay DB values
        // Attempt to parse JSON value if possible
        let dbValue = null;
        try {
            dbValue = config.value && typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
        } catch (e) {
            // If not JSON, use as literal if string
            dbValue = typeof config.value === 'string' ? config.value : null;
        }

        // Final result: Start with base defaults, overlay DB values
        let finalData = baseDefaults;

        const isObject = (val) => val && typeof val === 'object' && !Array.isArray(val);

        if (isObject(dbValue)) {
            if (isObject(baseDefaults)) {
                // Deep merge for known structures
                finalData = { ...baseDefaults, ...dbValue };
                
                // Nested merge for templates
                if (baseDefaults.templates && dbValue.templates && isObject(dbValue.templates)) {
                    finalData.templates = { ...baseDefaults.templates, ...dbValue.templates };
                }
                
                // Nested merge for minPayout in finance_settings
                if (baseDefaults.minPayout && dbValue.minPayout && isObject(dbValue.minPayout)) {
                    finalData.minPayout = { ...baseDefaults.minPayout, ...dbValue.minPayout };
                }
            } else {
                // baseDefaults is likely a string or null, but dbValue is an object.
                // Prioritize DB object.
                finalData = dbValue;
            }
        } else if (dbValue !== undefined && dbValue !== null && dbValue !== '') {
            // dbValue is a primitive (like a string of HTML)
            finalData = dbValue;
        }

        res.json({ success: true, data: finalData });
    } catch (error) {
        console.error('Get Config Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch config' });
    }
};

exports.updateConfig = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        // Strict Role Check (Double Layer Security)
        const userRoleStr = String(req.user?.role || '').toLowerCase();
        const userRoles = Array.isArray(req.user?.roles) ? req.user.roles.map(r => String(r).toLowerCase()) : [userRoleStr];
        
        const isSuperAdmin = ['superadmin', 'super_admin', 'super-admin'].includes(userRoleStr) || 
                           userRoles.some(r => ['superadmin', 'super_admin', 'super-admin'].includes(r));
        
        if (!isSuperAdmin && !['admin'].includes(userRoleStr)) {
            return res.status(403).json({ success: false, message: 'Access denied. Admin or Super Admin only.' });
        }

        let stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

        const [config, created] = await PlatformConfig.findOrCreate({
            where: { key },
            defaults: { value: stringValue }
        });

        if (!created) {
            config.value = stringValue;
            await config.save();
        }

        // Broadcast maintenance updates via WebSockets
        if (key === 'maintenance_settings') {
            console.log('[PlatformConfigController] Broadcasting maintenance update...');
            emitRealtimeUpdate('maintenance', { 
                action: 'update',
                key: 'maintenance_settings',
                settings: value 
            });
        }

        // Trigger WhatsApp re-initialization if config changes
        if (key === 'whatsapp_config') {
            console.log('[PlatformConfigController] WhatsApp config updated. Triggering re-init...');
            const { restartWhatsApp } = require('../utils/messageService');
            restartWhatsApp().catch(err => console.error('Restart Error:', err));
        }

        res.json({ success: true, message: 'Settings updated successfully', data: value });
    } catch (error) {
        console.error('Update Config Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update config' });
    }
};

const { getWhatsAppStatus, restartWhatsApp, logoutWhatsApp } = require('../utils/messageService');

exports.getWhatsAppStatus = async (req, res) => {
    try {
        const status = getWhatsAppStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch WhatsApp status' });
    }
};

exports.handleRestartWhatsApp = async (req, res) => {
    try {
        await restartWhatsApp();
        res.json({ success: true, message: 'WhatsApp restart initiated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to restart WhatsApp' });
    }
};

exports.handleLogoutWhatsApp = async (req, res) => {
    try {
        await logoutWhatsApp();
        res.json({ success: true, message: 'WhatsApp logout and session clear initiated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to logout WhatsApp' });
    }
};
