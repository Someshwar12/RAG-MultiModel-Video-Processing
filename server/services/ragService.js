// server/services/ragService.js
// ============================================================
// RAG Query Service — Retrieval + Generation Pipeline
// 1. Embed user query
// 2. Multimodal Pinecone search (transcript + visual)
// 3. Fetch surrounding context from MongoDB (sliding window)
// 4. Build structured prompt with XML tags
// 5. Generate response via LLM (GPT-4o or Llama 3)
// ============================================================

const { Transcript, VisualDescription, SentimentInsight } = require('../models');
const { multimodalSearch, searchTranscripts } = require('./vectorService');
const { generate, buildRAGSystemPrompt, getDefaultProvider } = require('./llmService');
const logger = require('../utils/logger');

/**
 * Execute a full RAG query for a video.
 *
 * @param {Object} params
 * @param {string} params.videoId - The video to query
 * @param {string} params.query - User's natural language question
 * @param {Array}  params.chatHistory - Previous messages [{role, content}]
 * @param {Object} [params.options]
 * @param {string} [params.options.provider] - "openai" or "llama"
 * @param {string} [params.options.speakerId] - For Virtual Participant scoped RAG
 * @param {Object} [params.options.persona] - Persona config for Virtual Participant
 * @param {number} [params.options.contextWindow=30] - Sliding window in seconds
 * @returns {Object} - { response, retrievedChunks, retrievedFrames, referencedTimestamps }
 */
const queryVideo = async ({ videoId, query, chatHistory = [], options = {} }) => {
  const {
    provider,
    speakerId,
    persona,
    contextWindow = 30,
  } = options;

  const startTime = Date.now();

  try {
    // ====================================================
    // STEP 1: Multimodal semantic search in Pinecone
    // ====================================================
    let searchResults;

    if (speakerId) {
      // Scoped RAG: Only search this speaker's content
      searchResults = await searchTranscripts(query, videoId, {
        topK: 10,
        speakerId,
      });
      // Map to unified format
      searchResults = searchResults.map((r) => ({
        ...r,
        source: 'transcript',
        weightedScore: r.score,
      }));
    } else {
      searchResults = await multimodalSearch(query, videoId, { topK: 10 });
    }

    if (searchResults.length === 0) {
      return {
        response: "I couldn't find any relevant content in this video for your question. Could you try rephrasing, or ask about a different topic covered in the recording?",
        retrievedChunks: [],
        retrievedFrames: [],
        referencedTimestamps: [],
        searchLatencyMs: Date.now() - startTime,
      };
    }

    // ====================================================
    // STEP 2: Fetch full context from MongoDB
    // ====================================================
    const retrievedChunks = [];
    const retrievedFrames = [];
    const allTimestamps = new Set();

    for (const result of searchResults) {
      const mongoId = result.metadata?.mongo_doc_id;
      if (!mongoId) continue;

      if (result.source === 'transcript') {
        // Fetch the matched chunk + sliding window context
        const centerTime = result.metadata?.start_time || 0;
        const windowChunks = await Transcript.getSlidingWindow(
          videoId,
          centerTime,
          contextWindow
        );

        for (const chunk of windowChunks) {
          if (!retrievedChunks.find((c) => c._id?.toString() === chunk._id?.toString())) {
            retrievedChunks.push({
              ...chunk,
              relevanceScore: result.score,
            });
            allTimestamps.add(Math.floor(chunk.startTime));
          }
        }
      } else if (result.source === 'visual') {
        const frame = await VisualDescription.findById(mongoId).lean();
        if (frame) {
          retrievedFrames.push({
            ...frame,
            relevanceScore: result.score,
          });
          allTimestamps.add(Math.floor(frame.timestamp));
        }
      }
    }

    // Sort by timestamp
    retrievedChunks.sort((a, b) => a.startTime - b.startTime);
    retrievedFrames.sort((a, b) => a.timestamp - b.timestamp);

    // ====================================================
    // STEP 3: Fetch sentiment data for context
    // ====================================================
    let sentimentData = null;
    if (retrievedChunks.length > 0) {
      const midTime = retrievedChunks[Math.floor(retrievedChunks.length / 2)]?.startTime || 0;
      sentimentData = await SentimentInsight.findOne({
        videoId,
        timestamp: { $gte: midTime - 15, $lte: midTime + 15 },
      })
        .sort({ timestamp: 1 })
        .lean();
    }

    // ====================================================
    // STEP 4: Build system prompt with structured context
    // ====================================================
    const systemPrompt = buildRAGSystemPrompt(
      retrievedChunks,
      retrievedFrames,
      sentimentData,
      persona || null
    );

    // ====================================================
    // STEP 5: Generate LLM response
    // ====================================================
    const messages = [
      ...chatHistory.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: query },
    ];

    const response = await generate(systemPrompt, messages, { provider });

    // ====================================================
    // STEP 6: Extract referenced timestamps from response
    // ====================================================
    const timestampRegex = /\[(\d{1,2}:\d{2})\]/g;
    const referencedTimestamps = [];
    let match;
    while ((match = timestampRegex.exec(response)) !== null) {
      const [mins, secs] = match[1].split(':').map(Number);
      const timeInSeconds = mins * 60 + secs;
      referencedTimestamps.push({
        time: timeInSeconds,
        label: match[0],
        context: '',
      });
    }

    const totalLatency = Date.now() - startTime;
    logger.info(
      `RAG query completed in ${totalLatency}ms — ${retrievedChunks.length} chunks, ${retrievedFrames.length} frames`
    );

    return {
      response,
      retrievedChunks: retrievedChunks.map((c) => ({
        chunkId: c._id,
        text: c.text,
        speakerId: c.speakerId,
        startTime: c.startTime,
        endTime: c.endTime,
        relevanceScore: c.relevanceScore,
      })),
      retrievedFrames: retrievedFrames.map((f) => ({
        frameId: f._id,
        description: f.description,
        timestamp: f.timestamp,
        framePath: f.framePath,
        relevanceScore: f.relevanceScore,
      })),
      referencedTimestamps,
      searchMetadata: {
        totalCandidates: searchResults.length,
        searchLatencyMs: totalLatency,
        provider: provider || getDefaultProvider(),
      },
    };
  } catch (error) {
    logger.error(`RAG query failed: ${error.message}`);
    throw error;
  }
};

module.exports = { queryVideo };
