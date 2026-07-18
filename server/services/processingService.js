// server/services/processingService.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Video, Transcript, VisualDescription } = require('../models');
const { embedBatch } = require('./embeddingService');
const { upsertTranscriptVectors, upsertVisualVectors } = require('./vectorService');
const logger = require('../utils/logger');

const PYTHON_EXE = process.env.PYTHON_EXECUTABLE || 'python3';
const WORKERS_DIR = path.join(__dirname, '..', 'python-workers');

const runPythonWorker = (scriptName, inputPayload, onProgress) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(WORKERS_DIR, scriptName);
    if (!fs.existsSync(scriptPath)) return reject(new Error(`Worker not found: ${scriptPath}`));

    const proc = spawn(PYTHON_EXE, ['-u', scriptPath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: WORKERS_DIR,
    });

    let finalResult = null;
    let stderrBuffer = '';

    proc.stdin.write(JSON.stringify(inputPayload));
    proc.stdin.end();

    let buffer = '';
    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.type === 'progress' && onProgress) onProgress(msg);
          else if (msg.type === 'result') finalResult = msg.data;
          else if (msg.type === 'error') logger.error(`Python worker error: ${msg.message}`);
        } catch (e) { logger.debug(`Python stdout: ${line}`); }
      }
    });

    proc.stderr.on('data', (data) => { stderrBuffer += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Python worker ${scriptName} exited with code ${code}`);
        if (stderrBuffer) logger.error(`stderr: ${stderrBuffer.slice(0, 2000)}`);
        reject(new Error(`Worker failed (exit ${code}): ${stderrBuffer.slice(0, 500)}`));
        return;
      }
      resolve(finalResult);
    });

    proc.on('error', (err) => { reject(new Error(`Failed to spawn ${scriptName}: ${err.message}`)); });
  });
};

const processVideo = async (videoId, io) => {
  const video = await Video.findById(videoId);
  if (!video) throw new Error(`Video not found: ${videoId}`);

  const room = `video:${videoId}`;
  const emitProgress = (pipeline, stage, progress, message) => {
    io.to(room).emit('processing:progress', { videoId, pipeline, stage, progress, message });
  };

  try {
    video.status = 'processing';
    await video.save();

    // STEP 1: Extract audio
    emitProgress('audio', 'extracting_audio', 5, 'Extracting audio stream...');
    await video.updatePipelineStage('audio', 'extracting_audio', 5, 'Extracting audio...');

    const audioDir = path.join(__dirname, '..', 'uploads', 'audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
    const audioPath = path.join(audioDir, `${videoId}.wav`);

    const { execSync } = require('child_process');
    execSync(`ffmpeg -i "${video.filePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}"`, { stdio: 'pipe' });

    video.extractedAudioPath = audioPath;
    await video.save();
    emitProgress('audio', 'extracting_audio', 15, 'Audio extracted');

    // STEP 2: Transcribe + Diarize
    emitProgress('audio', 'transcribing', 20, 'Transcribing audio...');
    await video.updatePipelineStage('audio', 'transcribing', 20, 'Transcribing...');

    const audioResult = await runPythonWorker('audio/transcribe_and_diarize.py', {
      audio_path: audioPath, video_id: videoId,
      whisper_model: process.env.LOCAL_WHISPER_MODEL || 'base',
      hf_token: process.env.HF_AUTH_TOKEN || '',
    }, (prog) => { emitProgress('audio', prog.stage || 'transcribing', prog.progress, prog.message); });

    if (audioResult?.chunks?.length > 0) {
      const transcriptDocs = audioResult.chunks.map((chunk, idx) => ({
        videoId, startTime: chunk.start, endTime: chunk.end,
        speakerId: chunk.speaker_id || 'SPEAKER_00', text: chunk.text,
        words: chunk.words || [], chunkIndex: idx, language: audioResult.language || 'en',
      }));
      await Transcript.insertMany(transcriptDocs);
      video.stats.totalTranscriptChunks = transcriptDocs.length;
      video.stats.totalSpeakers = audioResult.num_speakers || 1;
    }

    if (audioResult?.speaker_profiles) {
      video.speakerProfiles = audioResult.speaker_profiles.map((sp) => ({
        speakerId: sp.speaker_id, totalSpeakingTime: sp.total_speaking_time || 0, wordCount: sp.word_count || 0,
      }));
    }

    await video.updatePipelineStage('audio', 'completed', 100, 'Audio pipeline complete');
    emitProgress('audio', 'completed', 100, 'Audio pipeline complete');

    // STEP 3: Visual Pipeline
    emitProgress('visual', 'extracting_frames', 10, 'Extracting keyframes...');
    await video.updatePipelineStage('visual', 'extracting_frames', 10, 'Extracting frames...');

    const framesDir = path.join(__dirname, '..', 'uploads', 'frames', videoId);
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

    const visualResult = await runPythonWorker('visual/extract_and_describe.py', {
      video_path: video.filePath, output_dir: framesDir, video_id: videoId,
      batch_size: parseInt(process.env.VISUAL_BATCH_SIZE) || 4,
      img_size: parseInt(process.env.VISUAL_IMG_SIZE) || 256,
      fps: parseFloat(process.env.FRAME_EXTRACTION_FPS) || 0.2,
    }, (prog) => { emitProgress('visual', prog.stage || 'embedding_visuals', prog.progress, prog.message); });

    if (visualResult?.frames?.length > 0) {
      const visualDocs = visualResult.frames.map((frame, idx) => ({
        videoId, timestamp: frame.timestamp, frameIndex: idx, framePath: frame.frame_path,
        description: frame.description,
        detectedElements: {
          hasWhiteboard: frame.has_whiteboard || false, hasSlide: frame.has_slide || false,
          hasDiagram: frame.has_diagram || false, hasCode: frame.has_code || false,
          hasChart: frame.has_chart || false, hasText: frame.has_text || false,
          detectedText: frame.detected_text || null, sceneType: frame.scene_type || 'other',
          peopleCount: frame.people_count || 0,
        },
        modelUsed: visualResult.model_used || 'local', processingTimeMs: frame.processing_time_ms || null,
      }));
      await VisualDescription.insertMany(visualDocs);
      video.stats.totalVisualDescriptions = visualDocs.length;
      video.stats.totalKeyframes = visualDocs.length;
    }

    await video.updatePipelineStage('visual', 'completed', 100, 'Visual pipeline complete');
    emitProgress('visual', 'completed', 100, 'Visual pipeline complete');

    // STEP 4: Embeddings + Vector Indexing
    emitProgress('embedding', 'indexing_vectors', 10, 'Generating embeddings...');
    await video.updatePipelineStage('embedding', 'indexing_vectors', 10, 'Embedding...');

    const transcripts = await Transcript.find({ videoId }).sort({ chunkIndex: 1 });
    if (transcripts.length > 0) {
      const texts = transcripts.map((t) => t.text);
      const embeddings = await embedBatch(texts);

      const pineconeChunks = transcripts.map((t, i) => ({
        id: `t_${videoId}_${t.chunkIndex}`, text: t.text,
        metadata: { video_id: videoId, speaker_id: t.speakerId, start_time: t.startTime,
          end_time: t.endTime, chunk_index: t.chunkIndex, mongo_doc_id: t._id.toString() },
      }));
      await upsertTranscriptVectors(pineconeChunks, embeddings);

      for (let i = 0; i < transcripts.length; i++) {
        transcripts[i].pineconeVectorId = pineconeChunks[i].id;
        await transcripts[i].save();
      }
      emitProgress('embedding', 'indexing_vectors', 60, `Embedded ${transcripts.length} transcript chunks`);
    }

    const visuals = await VisualDescription.find({ videoId }).sort({ frameIndex: 1 });
    if (visuals.length > 0) {
      const texts = visuals.map((v) => v.description);
      const embeddings = await embedBatch(texts);

      const pineconeFrames = visuals.map((v, i) => ({
        id: `v_${videoId}_${v.frameIndex}`, text: v.description,
        metadata: { video_id: videoId, timestamp: v.timestamp, frame_index: v.frameIndex,
          mongo_doc_id: v._id.toString(), has_whiteboard: v.detectedElements?.hasWhiteboard || false,
          has_diagram: v.detectedElements?.hasDiagram || false, has_slide: v.detectedElements?.hasSlide || false,
          scene_type: v.detectedElements?.sceneType || 'other' },
      }));
      await upsertVisualVectors(pineconeFrames, embeddings);

      for (let i = 0; i < visuals.length; i++) {
        visuals[i].pineconeVectorId = pineconeFrames[i].id;
        await visuals[i].save();
      }
      emitProgress('embedding', 'indexing_vectors', 90, `Embedded ${visuals.length} visual frames`);
    }

    await video.updatePipelineStage('embedding', 'completed', 100, 'Indexing complete');
    emitProgress('embedding', 'completed', 100, 'All vectors indexed');

    // STEP 5: Sentiment
    emitProgress('sentiment', 'sentiment_analysis', 10, 'Analyzing sentiment...');
    await video.updatePipelineStage('sentiment', 'sentiment_analysis', 10, 'Sentiment analysis...');

    const transcriptsForSentiment = await Transcript.find({ videoId }).sort({ chunkIndex: 1 }).lean();
    if (transcriptsForSentiment.length > 0) {
      const sentimentChunks = transcriptsForSentiment.map((t) => ({
        text: t.text, start: t.startTime, end: t.endTime, speaker_id: t.speakerId,
      }));
      try {
        const sentimentResult = await runPythonWorker('agents/sentiment_analyzer.py',
          { video_id: videoId, chunks: sentimentChunks },
          (prog) => { emitProgress('sentiment', prog.stage || 'sentiment_analysis', prog.progress, prog.message); });
        if (sentimentResult?.sentiments?.length > 0) {
          const { SentimentInsight } = require('../models');
          await SentimentInsight.insertMany(sentimentResult.sentiments.map((s) => ({ videoId, ...s })));
        }
      } catch (e) { logger.warn(`Sentiment failed (non-fatal): ${e.message}`); }
    }

    await video.updatePipelineStage('sentiment', 'completed', 100, 'Mood Map generated');
    emitProgress('sentiment', 'completed', 100, 'Sentiment complete');

    // STEP 6: Fact-checking
    emitProgress('factCheck', 'fact_checking', 5, 'Starting fact-checker...');
    await video.updatePipelineStage('factCheck', 'fact_checking', 5, 'Fact-checking...');

    try {
      const { runFactChecker } = require('./agentService');
      await runFactChecker(videoId, io);
    } catch (e) {
      logger.warn(`Fact-check failed (non-fatal): ${e.message}`);
      await video.updatePipelineStage('factCheck', 'completed', 100, 'Fact-check skipped');
    }

    // STEP 7: Done
    video.status = 'completed';
    video.overallProgress = 100;
    await video.save();

    emitProgress('all', 'completed', 100, 'Video processing complete!');
    logger.info(`Video ${videoId} fully processed`);
    return video;
  } catch (error) {
    logger.error(`Processing failed for video ${videoId}: ${error.message}`);
    video.status = 'failed';
    await video.save();
    emitProgress('all', 'failed', 0, `Processing failed: ${error.message}`);
    throw error;
  }
};

module.exports = { processVideo, runPythonWorker };
