// server/routes/chat.js
// ============================================================
// Chat API Routes
// POST   /api/chat/:videoId/message   — Send a message (RAG query)
// POST   /api/chat/:videoId/persona   — Chat with Virtual Participant
// GET    /api/chat/:videoId/sessions  — List chat sessions
// GET    /api/chat/:videoId/sessions/:sessionId — Get session history
// DELETE /api/chat/:videoId/sessions/:sessionId — Delete session
// ============================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

router.use(protect);

// Chat
router.post('/:videoId/message', chatController.sendMessage);
router.post('/:videoId/persona', chatController.chatWithPersona);

// Sessions
router.get('/:videoId/sessions', chatController.listSessions);
router.get('/:videoId/sessions/:sessionId', chatController.getSession);
router.delete('/:videoId/sessions/:sessionId', chatController.deleteSession);

module.exports = router;
