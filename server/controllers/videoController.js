// server/controllers/videoController.js
// ============================================================
// Video Controller — Request handlers for video API routes
// ============================================================

const path = require('path');
const fs = require('fs');
const { Video, Transcript, VisualDescription, SentimentInsight, ChatSession } = require('../models');
const { processVideo } = require('../services/processingService');
const { deleteVideoVectors } = require('../services/vectorService');
const logger = require('../utils/logger');

/**
 * POST /api/videos/upload
 * Upload a new video file. FFmpeg conversion handled by middleware.
 */
exports.uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No video file uploaded.',
      });
    }

    const video = await Video.create({
      title: req.body.title || path.parse(req.file.originalname).name,
      originalFilename: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      duration: req.videoMeta?.duration || null,
      resolution: {
        width: req.videoMeta?.width || null,
        height: req.videoMeta?.height || null,
      },
      uploadedBy: req.user._id,
      tags: req.body.tags ? req.body.tags.split(',').map((t) => t.trim()) : [],
      description: req.body.description || '',
    });

    logger.info(`Video uploaded: ${video._id} (${video.title})`);

    res.status(201).json({
      success: true,
      data: video,
    });
  } catch (error) {
    logger.error(`Upload failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Video upload failed.',
    });
  }
};

/**
 * POST /api/videos/:id/process
 * Trigger the full ingestion pipeline for an uploaded video.
 * Runs asynchronously — client listens via Socket.IO for progress.
 */
exports.triggerProcessing = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found.',
      });
    }

    if (video.status === 'processing') {
      return res.status(409).json({
        success: false,
        error: 'Video is already being processed.',
      });
    }

    // Respond immediately — processing runs in background
    res.status(202).json({
      success: true,
      message: 'Processing started. Listen to Socket.IO for progress updates.',
      data: { videoId: video._id, status: 'processing' },
    });

    // Fire and forget — process in background
    const io = req.app.get('io');
    processVideo(video._id.toString(), io).catch((err) => {
      logger.error(`Background processing failed for ${video._id}: ${err.message}`);
    });
  } catch (error) {
    logger.error(`Trigger processing failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to start processing.',
    });
  }
};

/**
 * GET /api/videos
 * List all videos for the current user.
 */
exports.listVideos = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { uploadedBy: req.user._id };

    if (status) query.status = status;

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-processingPipeline')
      .lean();

    const total = await Video.countDocuments(query);

    res.json({
      success: true,
      data: videos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`List videos failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch videos.' });
  }
};

/**
 * GET /api/videos/:id
 * Get full video details including processing pipeline status.
 */
exports.getVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).lean();

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found.',
      });
    }

    res.json({ success: true, data: video });
  } catch (error) {
    logger.error(`Get video failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch video.' });
  }
};

/**
 * DELETE /api/videos/:id
 * Delete video + all linked data (transcripts, visuals, sentiment, chat, vectors).
 */
exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({
        success: false,
        error: 'Video not found.',
      });
    }

    // Delete all linked MongoDB data
    await Promise.all([
      Transcript.deleteMany({ videoId: video._id }),
      VisualDescription.deleteMany({ videoId: video._id }),
      SentimentInsight.deleteMany({ videoId: video._id }),
      ChatSession.deleteMany({ videoId: video._id }),
    ]);

    // Delete Pinecone vectors
    try {
      await deleteVideoVectors(video._id.toString());
    } catch (vecErr) {
      logger.warn(`Failed to delete vectors (non-fatal): ${vecErr.message}`);
    }

    // Delete files from disk
    if (video.filePath && fs.existsSync(video.filePath)) {
      fs.unlinkSync(video.filePath);
    }
    if (video.extractedAudioPath && fs.existsSync(video.extractedAudioPath)) {
      fs.unlinkSync(video.extractedAudioPath);
    }
    const framesDir = path.join(__dirname, '..', 'uploads', 'frames', video._id.toString());
    if (fs.existsSync(framesDir)) {
      fs.rmSync(framesDir, { recursive: true, force: true });
    }

    await Video.findByIdAndDelete(video._id);

    logger.info(`Video deleted: ${video._id}`);
    res.json({ success: true, message: 'Video and all linked data deleted.' });
  } catch (error) {
    logger.error(`Delete video failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to delete video.' });
  }
};

/**
 * GET /api/videos/:id/speakers
 * Get speaker profiles for Virtual Participant feature.
 */
exports.getSpeakers = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).select('speakerProfiles').lean();

    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    res.json({ success: true, data: video.speakerProfiles || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch speakers.' });
  }
};

/**
 * PUT /api/videos/:id/speakers/:speakerId
 * Assign a human-readable label and role to a speaker.
 * e.g., SPEAKER_00 → "Sarah Chen" (role: "CTO")
 */
exports.labelSpeaker = async (req, res) => {
  try {
    const { label, role, avatarUrl } = req.body;
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    const speaker = video.speakerProfiles.find(
      (sp) => sp.speakerId === req.params.speakerId
    );

    if (!speaker) {
      return res.status(404).json({ success: false, error: 'Speaker not found.' });
    }

    if (label) speaker.label = label;
    if (role) speaker.role = role;
    if (avatarUrl) speaker.avatarUrl = avatarUrl;

    // Also update all transcript chunks with this speaker's label
    await Transcript.updateMany(
      { videoId: video._id, speakerId: req.params.speakerId },
      { speakerLabel: label ? `${label}${role ? ` (${role})` : ''}` : null }
    );

    await video.save();

    res.json({ success: true, data: speaker });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update speaker.' });
  }
};
