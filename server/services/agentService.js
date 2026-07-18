// server/services/agentService.js
// ============================================================
// Agent Orchestration Service
// Coordinates the async Python agents from Node.js:
//   - Bullshit Detector (fact_checker.py)
//   - Whiteboard Digitalizer (whiteboard_digitalizer.py)
// Called after the main ingestion pipeline completes,
// or on-demand from API endpoints.
// ============================================================

const { Transcript, VisualDescription, Video } = require('../models');
const { runPythonWorker } = require('./processingService');
const logger = require('../utils/logger');

/**
 * Run the Bullshit Detector on all transcript chunks for a video.
 * Updates Transcript documents with fact-check flags.
 * Broadcasts results via Socket.IO.
 *
 * @param {string} videoId
 * @param {Object} io - Socket.IO instance
 */
const runFactChecker = async (videoId, io) => {
  const room = `video:${videoId}`;

  try {
    io?.to(room).emit('processing:progress', {
      videoId,
      pipeline: 'factCheck',
      stage: 'fact_checking',
      progress: 5,
      message: 'Starting Bullshit Detector...',
    });

    // Fetch all transcript chunks
    const transcripts = await Transcript.find({ videoId })
      .sort({ chunkIndex: 1 })
      .select('text startTime endTime speakerId chunkIndex')
      .lean();

    if (transcripts.length === 0) {
      logger.info(`No transcripts for video ${videoId} — skipping fact-check`);
      return { skipped: true, reason: 'No transcripts' };
    }

    const chunks = transcripts.map((t) => ({
      text: t.text,
      start: t.startTime,
      end: t.endTime,
      speaker_id: t.speakerId,
      chunk_index: t.chunkIndex,
    }));

    // Run the Python fact-checker agent
    const result = await runPythonWorker(
      'agents/fact_checker.py',
      { video_id: videoId, chunks },
      (prog) => {
        io?.to(room).emit('processing:progress', {
          videoId,
          pipeline: 'factCheck',
          stage: prog.stage || 'fact_checking',
          progress: prog.progress,
          message: prog.message,
        });
      }
    );

    if (result?.skipped) {
      return result;
    }

    // Update MongoDB Transcript documents with fact-check results
    let contradictions = 0;

    if (result?.fact_checks?.length > 0) {
      for (const fc of result.fact_checks) {
        const chunkIndex = fc.chunk_index;

        const updateData = {
          factCheckStatus: fc.verdict === 'VERIFIED'
            ? 'verified'
            : fc.verdict === 'CONTRADICTED'
              ? 'contradicted'
              : 'unverifiable',
          factCheckDetails: {
            claim: fc.claim,
            verdict: fc.verdict,
            evidence: fc.explanation || fc.evidence_summary,
            sourceUrl: fc.source_url,
            correctedValue: fc.corrected_value,
            checkedAt: new Date(),
          },
        };

        await Transcript.updateOne(
          { videoId, chunkIndex },
          { $set: updateData }
        );

        if (fc.verdict === 'CONTRADICTED') {
          contradictions++;

          // Emit real-time alert for contradictions (red banner in UI)
          io?.to(room).emit('factcheck:alert', {
            videoId,
            chunkIndex,
            claim: fc.claim,
            verdict: 'CONTRADICTED',
            correctedValue: fc.corrected_value,
            explanation: fc.explanation,
            sourceUrl: fc.source_url,
            timestamp: fc.timestamp,
          });
        }
      }
    }

    // Update video stats
    await Video.findByIdAndUpdate(videoId, {
      $set: {
        'stats.totalFactChecks': result?.fact_checks?.length || 0,
        'stats.contradictionsFound': contradictions,
      },
    });

    // Update pipeline stage
    const video = await Video.findById(videoId);
    if (video) {
      await video.updatePipelineStage('factCheck', 'completed', 100,
        `Found ${contradictions} contradictions in ${result?.fact_checks?.length || 0} claims`);
    }

    io?.to(room).emit('processing:progress', {
      videoId,
      pipeline: 'factCheck',
      stage: 'completed',
      progress: 100,
      message: `Fact-check complete: ${contradictions} contradictions found`,
    });

    logger.info(`Fact-checker completed for ${videoId}: ${result?.fact_checks?.length} claims, ${contradictions} contradictions`);

    return result;
  } catch (error) {
    logger.error(`Fact-checker failed for ${videoId}: ${error.message}`);
    throw error;
  }
};

/**
 * Digitalize a specific diagram/whiteboard frame.
 * Called on-demand when user clicks "Digitize" on a frame.
 *
 * @param {string} videoId
 * @param {string} frameId - MongoDB VisualDescription ID
 * @returns {Object} - { mermaid_code, diagram_type, confidence }
 */
const digitalizeFrame = async (videoId, frameId) => {
  try {
    const frame = await VisualDescription.findById(frameId);
    if (!frame) throw new Error(`Frame not found: ${frameId}`);

    // Run the Python whiteboard digitalizer
    const result = await runPythonWorker(
      'agents/whiteboard_digitalizer.py',
      {
        video_id: videoId,
        frame_path: frame.framePath,
        timestamp: frame.timestamp,
        description: frame.description,
      },
      null // No progress needed for single-frame
    );

    if (result?.digitalized?.length > 0) {
      const digitalized = result.digitalized[0];

      // Save Mermaid code back to the VisualDescription document
      frame.digitalizedDiagram = {
        mermaidCode: digitalized.mermaid_code,
        diagramType: digitalized.diagram_type,
        confidence: digitalized.confidence,
      };
      await frame.save();

      return {
        mermaidCode: digitalized.mermaid_code,
        diagramType: digitalized.diagram_type,
        confidence: digitalized.confidence,
        notes: digitalized.notes,
        framePath: frame.framePath,
        timestamp: frame.timestamp,
      };
    }

    return { error: 'No diagram detected in this frame' };
  } catch (error) {
    logger.error(`Whiteboard digitalization failed: ${error.message}`);
    throw error;
  }
};

/**
 * Batch-digitalize all diagram/whiteboard frames in a video.
 *
 * @param {string} videoId
 * @returns {Object} - { total, successful, digitalized: [...] }
 */
const digitalizeAllDiagrams = async (videoId) => {
  try {
    const diagramFrames = await VisualDescription.getDiagramFrames(videoId);

    if (diagramFrames.length === 0) {
      return { total: 0, successful: 0, digitalized: [] };
    }

    const frames = diagramFrames.map((f) => ({
      frame_path: f.framePath,
      timestamp: f.timestamp,
      description: f.description,
    }));

    const result = await runPythonWorker(
      'agents/whiteboard_digitalizer.py',
      { video_id: videoId, frames },
      null
    );

    // Save results back to MongoDB
    if (result?.digitalized) {
      for (let i = 0; i < result.digitalized.length; i++) {
        const dig = result.digitalized[i];
        if (dig.mermaid_code && i < diagramFrames.length) {
          await VisualDescription.findByIdAndUpdate(diagramFrames[i]._id, {
            $set: {
              'digitalizedDiagram.mermaidCode': dig.mermaid_code,
              'digitalizedDiagram.diagramType': dig.diagram_type,
              'digitalizedDiagram.confidence': dig.confidence,
            },
          });
        }
      }
    }

    return result;
  } catch (error) {
    logger.error(`Batch digitalization failed: ${error.message}`);
    throw error;
  }
};

module.exports = {
  runFactChecker,
  digitalizeFrame,
  digitalizeAllDiagrams,
};
