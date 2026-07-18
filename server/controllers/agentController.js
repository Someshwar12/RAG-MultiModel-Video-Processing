const { Video, VisualDescription } = require('../models');
const { runFactChecker, digitalizeFrame, digitalizeAllDiagrams } = require('../services/agentService');
const { agenticQuery } = require('../services/smartAgentService');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/agents/:videoId/factcheck
 */
exports.runFactCheck = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found.' });
    if (video.status !== 'completed') return res.status(400).json({ success: false, error: 'Video must be fully processed.' });

    res.status(202).json({ success: true, message: 'Bullshit Detector started.' });

    const io = req.app.get('io');
    runFactChecker(videoId, io).catch((err) => {
      logger.error(`Background fact-check failed: ${err.message}`);
    });
  } catch (error) {
    logger.error(`Fact-check trigger failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to start fact-check.' });
  }
};

/**
 * POST /api/agents/:videoId/digitalize/:frameId
 */
exports.digitalizeFrame = async (req, res) => {
  try {
    const { videoId, frameId } = req.params;
    const result = await digitalizeFrame(videoId, frameId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Digitalize frame failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Digitalization failed.' });
  }
};

/**
 * POST /api/agents/:videoId/digitalize-all
 */
exports.digitalizeAllDiagrams = async (req, res) => {
  try {
    const { videoId } = req.params;
    const result = await digitalizeAllDiagrams(videoId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Batch digitalize failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Batch digitalization failed.' });
  }
};

/**
 * GET /api/agents/:videoId/visual-frames
 * Returns all visual description frames for the video with detection metadata.
 */
exports.getVisualFrames = async (req, res) => {
  try {
    const { videoId } = req.params;
    const frames = await VisualDescription.find({ videoId })
      .sort({ timestamp: 1 })
      .select('timestamp framePath description detectedElements frameIndex')
      .lean();

    res.json({ success: true, data: frames });
  } catch (error) {
    logger.error(`Get visual frames failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch visual frames.' });
  }
};

/**
 * POST /api/agents/:videoId/diagrams-pdf
 * Generates a PDF of all diagram/slide/text frames and sends it as a download.
 */
exports.generateDiagramsPdf = async (req, res) => {
  try {
    const { videoId } = req.params;

    // Find frames with visual content
    const frames = await VisualDescription.find({
      videoId,
      $or: [
        { 'detectedElements.hasDiagram': true },
        { 'detectedElements.hasWhiteboard': true },
        { 'detectedElements.hasSlide': true },
        { 'detectedElements.hasCode': true },
        { 'detectedElements.hasChart': true },
        { 'detectedElements.hasText': true },
      ],
    }).sort({ timestamp: 1 }).lean();

    if (frames.length === 0) {
      return res.status(404).json({ success: false, error: 'No visual frames to export.' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=diagrams-${videoId.slice(-8)}.pdf`);
    doc.pipe(res);

    // Title page
    doc.fontSize(24).fillColor('#D4943A').text('Zeta Video-RAG', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#333333').text('Extracted Visual Content', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#888888').text(`${frames.length} frames extracted`, { align: 'center' });
    doc.moveDown(2);

    // Each frame
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (i > 0) doc.addPage();

      // Timestamp header
      const mins = Math.floor(frame.timestamp / 60);
      const secs = Math.floor(frame.timestamp % 60);
      const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      doc.fontSize(12).fillColor('#D4943A').text(`Frame ${i + 1} / ${frames.length}`, 40, 40);
      doc.fontSize(10).fillColor('#666666').text(`Timestamp: [${ts}]`, 40, 56);

      const sceneType = frame.detectedElements?.sceneType || 'other';
      doc.text(`Type: ${sceneType.replace(/_/g, ' ')}`, 40, 70);

      // Try to embed the image
      if (frame.framePath && fs.existsSync(frame.framePath)) {
        try {
          doc.image(frame.framePath, 40, 95, { width: 515, fit: [515, 380] });
        } catch (imgErr) {
          doc.text('[Image could not be embedded]', 40, 95);
        }
      } else {
        doc.text('[Frame image not found on disk]', 40, 95);
      }

      // Description
      const descY = 490;
      doc.fontSize(9).fillColor('#333333').text('Description:', 40, descY);
      doc.fontSize(8).fillColor('#555555').text(
        (frame.description || 'No description available').slice(0, 500),
        40, descY + 14, { width: 515 }
      );

      // Detected text
      if (frame.detectedElements?.detectedText) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#333333').text('Detected Text:');
        doc.fontSize(8).fillColor('#555555').text(
          frame.detectedElements.detectedText.slice(0, 500),
          { width: 515 }
        );
      }
    }

    doc.end();
  } catch (error) {
    logger.error(`PDF generation failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'PDF generation failed.' });
  }
};

/**
 * POST /api/agents/:videoId/smart-query
 */
exports.smartQuery = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { message, sessionId, provider } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, error: 'Message is required.' });

    const video = await Video.findById(videoId);
    if (!video) return res.status(404).json({ success: false, error: 'Video not found.' });

    const result = await agenticQuery({
      videoId, query: message, chatHistory: [], options: { provider },
    });

    res.json({
      success: true,
      data: {
        response: result.response, isAgentic: true, steps: result.steps,
        contradictionDetected: result.contradictionDetected,
        contradictionDetails: result.contradictionDetails,
        retrievedChunks: result.retrievedChunks, retrievedFrames: result.retrievedFrames,
        referencedTimestamps: result.referencedTimestamps, searchMetadata: result.searchMetadata,
      },
    });
  } catch (error) {
    logger.error(`Smart query failed: ${error.message}`);
    res.status(500).json({ success: false, error: 'Smart Agent query failed.' });
  }
};
