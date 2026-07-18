// server/routes/videos.js
// ============================================================
// Video API Routes
// POST   /api/videos/upload    — Upload a new video
// GET    /api/videos           — List all videos for user
// GET    /api/videos/:id       — Get video details + status
// DELETE /api/videos/:id       — Delete video + all linked data
// POST   /api/videos/:id/process — Trigger ingestion pipeline
// GET    /api/videos/:id/speakers — Get speaker profiles
// PUT    /api/videos/:id/speakers/:speakerId — Label a speaker
// ============================================================

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload, convertToMp4 } = require('../middleware/upload');
const videoController = require('../controllers/videoController');

// All routes require auth (demo user auto-attached)
router.use(protect);

// Upload & Process
router.post('/upload', upload.single('video'), convertToMp4, videoController.uploadVideo);
router.post('/:id/process', videoController.triggerProcessing);

// CRUD
router.get('/', videoController.listVideos);
router.get('/:id', videoController.getVideo);
router.delete('/:id', videoController.deleteVideo);

// Speaker Management (for Virtual Participant labeling)
router.get('/:id/speakers', videoController.getSpeakers);
router.put('/:id/speakers/:speakerId', videoController.labelSpeaker);

module.exports = router;
