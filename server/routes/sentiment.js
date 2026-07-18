// server/routes/sentiment.js
// ============================================================
// Sentiment / Mood Map API Routes
// GET  /api/sentiment/:videoId/timeline — Full sentiment timeline
// GET  /api/sentiment/:videoId/spikes   — Only spike moments
// GET  /api/sentiment/:videoId/speaker/:speakerId — Per-speaker sentiment
// ============================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const sentimentController = require('../controllers/sentimentController');

router.use(protect);

router.get('/:videoId/timeline', sentimentController.getTimeline);
router.get('/:videoId/spikes', sentimentController.getSpikes);
router.get('/:videoId/speaker/:speakerId', sentimentController.getSpeakerSentiment);

module.exports = router;
