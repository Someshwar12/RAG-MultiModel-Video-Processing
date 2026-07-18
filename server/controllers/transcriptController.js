// server/controllers/transcriptController.js
// ============================================================
// Transcript Controller — Transcript data endpoints
// ============================================================

const { Transcript } = require('../models');
const logger = require('../utils/logger');

/**
 * GET /api/transcripts/:videoId
 * Returns the full transcript with speaker IDs and timestamps.
 * Supports pagination and speaker filtering.
 */
exports.getFullTranscript = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 100, speakerId } = req.query;

    const query = { videoId };
    if (speakerId) query.speakerId = speakerId;

    const transcripts = await Transcript.find(query)
      .sort({ chunkIndex: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('startTime endTime speakerId speakerLabel text chunkIndex factCheckStatus')
      .lean();

    const total = await Transcript.countDocuments(query);

    // Add formatted time ranges
    const formatted = transcripts.map((t) => ({
      ...t,
      formattedTimeRange: formatTimeRange(t.startTime, t.endTime),
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Get transcript failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch transcript.' });
  }
};

/**
 * GET /api/transcripts/:videoId/search?q=keyword
 * Keyword search within the transcript text.
 */
exports.searchTranscript = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Search query "q" is required.',
      });
    }

    const results = await Transcript.find({
      videoId,
      $text: { $search: q },
    })
      .sort({ score: { $meta: 'textScore' } })
      .limit(20)
      .select('startTime endTime speakerId speakerLabel text chunkIndex')
      .lean();

    const formatted = results.map((t) => ({
      ...t,
      formattedTimeRange: formatTimeRange(t.startTime, t.endTime),
    }));

    res.json({
      success: true,
      data: formatted,
      query: q,
      count: formatted.length,
    });
  } catch (error) {
    logger.error(`Search transcript failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Search failed.' });
  }
};

/**
 * GET /api/transcripts/:videoId/factchecks
 * Returns all transcript chunks that have been fact-checked.
 * Filters: ?status=contradicted | verified | unverifiable
 */
exports.getFactChecks = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { status } = req.query;

    const query = {
      videoId,
      factCheckStatus: { $ne: 'unchecked' },
    };

    if (status) {
      query.factCheckStatus = status;
    }

    const factChecks = await Transcript.find(query)
      .sort({ startTime: 1 })
      .select('startTime endTime speakerId speakerLabel text factCheckStatus factCheckDetails')
      .lean();

    const formatted = factChecks.map((t) => ({
      ...t,
      formattedTimeRange: formatTimeRange(t.startTime, t.endTime),
    }));

    res.json({
      success: true,
      data: formatted,
      count: formatted.length,
      summary: {
        verified: formatted.filter((f) => f.factCheckStatus === 'verified').length,
        contradicted: formatted.filter((f) => f.factCheckStatus === 'contradicted').length,
        unverifiable: formatted.filter((f) => f.factCheckStatus === 'unverifiable').length,
      },
    });
  } catch (error) {
    logger.error(`Get fact checks failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch fact checks.' });
  }
};

/**
 * GET /api/transcripts/:videoId/actions
 * Returns all extracted action items from the Automated PM agent.
 */
exports.getActionItems = async (req, res) => {
  try {
    const { videoId } = req.params;

    const chunksWithActions = await Transcript.find({
      videoId,
      'actionItems.0': { $exists: true }, // Has at least one action item
    })
      .sort({ startTime: 1 })
      .select('startTime endTime speakerId speakerLabel actionItems')
      .lean();

    // Flatten all action items with their source context
    const allActions = [];
    for (const chunk of chunksWithActions) {
      for (const action of chunk.actionItems) {
        allActions.push({
          ...action,
          sourceTimestamp: chunk.startTime,
          formattedTime: formatTime(chunk.startTime),
          speakerId: chunk.speakerId,
          speakerLabel: chunk.speakerLabel,
        });
      }
    }

    res.json({
      success: true,
      data: allActions,
      count: allActions.length,
    });
  } catch (error) {
    logger.error(`Get action items failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch action items.' });
  }
};

// --- Helpers ---
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}
