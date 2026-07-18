// server/controllers/sentimentController.js
// ============================================================
// Sentiment Controller — Mood Map Data Endpoints
// ============================================================

const { SentimentInsight } = require('../models');
const logger = require('../utils/logger');

/**
 * GET /api/sentiment/:videoId/timeline
 * Returns the full sentiment timeline for the Mood Map chart.
 */
exports.getTimeline = async (req, res) => {
  try {
    const timeline = await SentimentInsight.getTimeline(req.params.videoId);

    res.json({
      success: true,
      data: timeline,
      count: timeline.length,
    });
  } catch (error) {
    logger.error(`Get timeline failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch sentiment timeline.' });
  }
};

/**
 * GET /api/sentiment/:videoId/spikes
 * Returns only the spike moments (clickable on Mood Map).
 */
exports.getSpikes = async (req, res) => {
  try {
    const spikes = await SentimentInsight.getSpikes(req.params.videoId);

    res.json({
      success: true,
      data: spikes,
      count: spikes.length,
    });
  } catch (error) {
    logger.error(`Get spikes failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch sentiment spikes.' });
  }
};

/**
 * GET /api/sentiment/:videoId/speaker/:speakerId
 * Returns sentiment data filtered to a specific speaker.
 */
exports.getSpeakerSentiment = async (req, res) => {
  try {
    const data = await SentimentInsight.getSpeakerSentiment(
      req.params.videoId,
      req.params.speakerId
    );

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    logger.error(`Get speaker sentiment failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch speaker sentiment.' });
  }
};
