const express = require('express');
const router = express.Router();
const { getConfig, updateConfig, getWhatsAppStatus, handleRestartWhatsApp } = require('../controllers/PlatformConfigController');
const { PlatformConfig } = require('../models');
const { authenticate, adminOnly } = require('../middleware/auth');

// Public route to fetch platform config
router.get('/config/:key', getConfig);

// Admin route to update platform config
router.post('/config/:key', authenticate, adminOnly, updateConfig);

// Protected WhatsApp Management
router.get('/whatsapp/status', authenticate, adminOnly, getWhatsAppStatus);
router.post('/whatsapp/restart', authenticate, adminOnly, handleRestartWhatsApp);

// Public maintenance status endpoint (always reachable, used by frontend startup check)
router.get('/status', async (req, res) => {
  try {
    const config = await PlatformConfig.findOne({ where: { key: 'maintenance_settings' } });
    if (config) {
      const settings = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
      if (settings.enabled) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          message: settings.message || 'System is currently under maintenance.'
        });
      }
      // Return granular settings for frontend visibility logic
      return res.json({ 
        success: true, 
        maintenance: false, 
        dashboards: settings.dashboards || {},
        sections: settings.sections || {}
      });
    }
  } catch (err) {
    return res.json({ success: true, maintenance: false });
  }
});

module.exports = router;
