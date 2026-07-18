// server/routes/transcripts.js
// ============================================================
// Transcript API Routes
// GET  /api/transcripts/:videoId          — Full transcript
// GET  /api/transcripts/:videoId/search   — Keyword search
// GET  /api/transcripts/:videoId/factchecks — All fact-check flags
// GET  /api/transcripts/:videoId/actions  — All extracted action items
// ============================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const transcriptController = require('../controllers/transcriptController');

router.use(protect);

router.get('/:videoId', transcriptController.getFullTranscript);
router.get('/:videoId/search', transcriptController.searchTranscript);
router.get('/:videoId/factchecks', transcriptController.getFactChecks);
router.get('/:videoId/actions', transcriptController.getActionItems);

module.exports = router;
