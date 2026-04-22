const express = require('express');
const router = express.Router();
const { sendMessage, getMessages, getMyMessagesSummary, markAsRead, sendBulkMessages } = require('../controllers/supportController');
const { auth } = require('../middleware/auth');

console.log('✅ Support Routes Loaded - Bulk Send Ready');

router.post('/send', auth, sendMessage);
router.post('/bulk', auth, sendBulkMessages);
router.get('/history', auth, getMessages);
router.get('/summary', auth, getMyMessagesSummary);
router.patch('/:messageId/read', auth, markAsRead);

module.exports = router;
