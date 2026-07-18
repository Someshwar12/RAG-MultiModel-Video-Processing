const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const agentController = require('../controllers/agentController');

router.use(protect);

// Bullshit Detector
router.post('/:videoId/factcheck', agentController.runFactCheck);

// Visual Frames (for Digitalize modal)
router.get('/:videoId/visual-frames', agentController.getVisualFrames);

// Whiteboard-to-Code Digitalizer
router.post('/:videoId/digitalize/:frameId', agentController.digitalizeFrame);
router.post('/:videoId/digitalize-all', agentController.digitalizeAllDiagrams);

// Diagrams PDF export
router.post('/:videoId/diagrams-pdf', agentController.generateDiagramsPdf);

// Smart Agent (multi-step agentic RAG)
router.post('/:videoId/smart-query', agentController.smartQuery);

module.exports = router;
