const { PlatformConfig } = require('./models');

async function fixTemplates() {
  try {
    const configRecord = await PlatformConfig.findOne({ where: { key: 'whatsapp_config' } });
    if (!configRecord) {
      console.log('No whatsapp_config found.');
      return;
    }

    let dbConfig = typeof configRecord.value === 'string' ? JSON.parse(configRecord.value) : configRecord.value;
    if (!dbConfig.templates) dbConfig.templates = {};

    console.log('Current orderPlaced template:', dbConfig.templates.orderPlaced);

    const newTemplate = `Hello {name}, your order #{orderNumber} has been placed successfully! 🛍️\n\nItems:\n{itemsList}\n\nTotal: KES {total}\nPayment: {paymentMethod}\n\nDelivery Information:\nMethod: {deliveryMethod}\nLocation: {deliveryLocation}\n\nTrack your order here: {trackUrl}`;

    dbConfig.templates.orderPlaced = newTemplate;
    
    // Also update other templates to be safe
    if (dbConfig.templates.sellerConfirmed && !dbConfig.templates.sellerConfirmed.includes('{trackUrl}')) {
        dbConfig.templates.sellerConfirmed += '\n\nTrack here: {trackUrl}';
    }

    configRecord.value = JSON.stringify(dbConfig);
    await configRecord.save();
    console.log('✅ Successfully updated orderPlaced template with {trackUrl}');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing templates:', error);
    process.exit(1);
  }
}

fixTemplates();
