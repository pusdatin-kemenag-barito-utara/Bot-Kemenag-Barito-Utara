const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { requireAuth } = require('../middleware/authMiddleware');

// Public/Header API key authenticated send route
router.post('/send', apiController.sendMessage);

// Protected routes (Requires Auth)
router.use(requireAuth);

// Messages API
router.get('/messages', apiController.getMessages);
router.get('/messages/chart', apiController.getMessagesChart);
router.get('/messages/search', apiController.searchMessages);
router.get('/messages/export', apiController.exportMessages);

// Contacts & Chats API
router.get('/contacts', apiController.getContacts);
router.get('/contacts/top', apiController.getTopContacts);
router.get('/chats', apiController.getChats);
router.get('/chats/:jid/messages', apiController.getChatMessages);
router.delete('/chats/:jid', apiController.deleteChat);
router.delete('/chats', apiController.deleteAllChats);

// Auto-Replies API
router.get('/auto-replies', apiController.getAutoReplies);
router.post('/auto-replies', apiController.saveAutoReply);
router.delete('/auto-replies/:id', apiController.deleteAutoReply);
router.post('/auto-replies/sync', apiController.syncAutoReplies);

// Webhook API
router.post('/webhook/test', apiController.testWebhook);
router.get('/webhook/logs', apiController.getWebhookLogs);

// WhatsApp Logout API
router.post('/logout', apiController.logoutWa);

module.exports = router;
