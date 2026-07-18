// server/services/smartAgentService.js
// ============================================================
// "Smart Agent" — Feature 3
// Unlike basic RAG that searches once and guesses, the Smart
// Agent checks its own work:
//   1. Finds video transcript context
//   2. Finds related documents/visual context
//   3. Compares and detects contradictions
//   4. If mismatch found, performs a SECOND search
//   5. Synthesizes a response with full audit trail
//
// Example:
//   Q: "Compare the budget in the video to the PDF"
//   → Finds video: "$500"
//   → Finds doc context: "$600"
//   → Detects mismatch → Second search
//   → Answer: "The video mentions $500, but the PDF says $600.
//     However, at minute 45, they agreed to update the PDF."
// ============================================================

const { Transcript, VisualDescription } = require('../models');
const { multimodalSearch, searchTranscripts } = require('./vectorService');
const { generate, buildRAGSystemPrompt } = require('./llmService');
const logger = require('../utils/logger');

/**
 * Execute an agentic multi-step RAG query.
 * The agent performs iterative retrieval with self-verification.
 *
 * @param {Object} params
 * @param {string} params.videoId
 * @param {string} params.query
 * @param {Array}  params.chatHistory
 * @param {Object} [params.options]
 * @returns {Object} - { response, steps, retrievedChunks, ... }
 */
const agenticQuery = async ({ videoId, query, chatHistory = [], options = {} }) => {
  const { provider, speakerId } = options;
  const steps = [];
  const startTime = Date.now();

  try {
    // ====================================================
    // STEP 1: Initial broad retrieval
    // ====================================================
    steps.push({ step: 1, action: 'initial_search', status: 'running' });

    const initialResults = await multimodalSearch(query, videoId, {
      topK: 15,
      speakerId,
    });

    steps[0].status = 'complete';
    steps[0].resultCount = initialResults.length;

    if (initialResults.length === 0) {
      return {
        response: "I couldn't find relevant content in this video for your question.",
        steps,
        retrievedChunks: [],
        isAgentic: true,
      };
    }

    // ====================================================
    // STEP 2: Fetch full context from MongoDB
    // ====================================================
    steps.push({ step: 2, action: 'fetch_context', status: 'running' });

    const transcriptChunks = [];
    const visualChunks = [];

    for (const result of initialResults) {
      const mongoId = result.metadata?.mongo_doc_id;
      if (!mongoId) continue;

      if (result.source === 'transcript') {
        const windowChunks = await Transcript.getSlidingWindow(
          videoId,
          result.metadata?.start_time || 0,
          30
        );
        for (const chunk of windowChunks) {
          if (!transcriptChunks.find((c) => c._id?.toString() === chunk._id?.toString())) {
            transcriptChunks.push(chunk);
          }
        }
      } else if (result.source === 'visual') {
        const frame = await VisualDescription.findById(mongoId).lean();
        if (frame) visualChunks.push(frame);
      }
    }

    transcriptChunks.sort((a, b) => a.startTime - b.startTime);
    steps[1].status = 'complete';
    steps[1].transcriptCount = transcriptChunks.length;
    steps[1].visualCount = visualChunks.length;

    // ====================================================
    // STEP 3: Self-verification — check for contradictions
    // ====================================================
    steps.push({ step: 3, action: 'self_verify', status: 'running' });

    const verificationPrompt = `You are a critical analysis assistant. Examine these retrieved context chunks and determine if they contain any contradictions, inconsistencies, or gaps that would require additional investigation.

<retrieved_context>
${transcriptChunks.slice(0, 10).map((c) => {
  const time = formatTimestamp(c.startTime);
  return `[${time}] ${c.speakerId}: ${c.text}`;
}).join('\n')}
</retrieved_context>

<visual_context>
${visualChunks.slice(0, 5).map((v) => {
  const time = formatTimestamp(v.timestamp);
  return `[${time}] VISUAL: ${v.description}`;
}).join('\n')}
</visual_context>

<user_question>${query}</user_question>

Analyze and respond with ONLY valid JSON:
{
  "has_contradiction": true/false,
  "has_information_gap": true/false,
  "contradiction_details": "description of the contradiction or null",
  "suggested_followup_query": "a refined search query to resolve the issue, or null",
  "confidence_in_initial_context": 0.0 to 1.0
}`;

    let verification = { has_contradiction: false, has_information_gap: false, confidence_in_initial_context: 0.8 };

    try {
      const verificationText = await generate(
        'You are a critical analysis assistant. Respond with valid JSON only.',
        [{ role: 'user', content: verificationPrompt }],
        { temperature: 0.1 }
      );

      const cleaned = verificationText.replace(/```(?:json)?/g, '').trim();
      verification = JSON.parse(cleaned);
    } catch (e) {
      logger.warn(`Smart Agent verification parse failed: ${e.message}`);
    }

    steps[2].status = 'complete';
    steps[2].hasContradiction = verification.has_contradiction;
    steps[2].confidence = verification.confidence_in_initial_context;

    // ====================================================
    // STEP 4: If contradiction/gap detected → second search
    // ====================================================
    let additionalChunks = [];

    if (
      verification.has_contradiction ||
      verification.has_information_gap ||
      verification.confidence_in_initial_context < 0.6
    ) {
      steps.push({ step: 4, action: 'followup_search', status: 'running' });

      const followupQuery = verification.suggested_followup_query || query;
      logger.info(`Smart Agent: Performing followup search — "${followupQuery}"`);

      const followupResults = await searchTranscripts(followupQuery, videoId, {
        topK: 8,
      });

      for (const result of followupResults) {
        const mongoId = result.metadata?.mongo_doc_id;
        if (!mongoId) continue;

        const windowChunks = await Transcript.getSlidingWindow(
          videoId,
          result.metadata?.start_time || 0,
          20
        );

        for (const chunk of windowChunks) {
          if (
            !transcriptChunks.find((c) => c._id?.toString() === chunk._id?.toString()) &&
            !additionalChunks.find((c) => c._id?.toString() === chunk._id?.toString())
          ) {
            additionalChunks.push(chunk);
          }
        }
      }

      additionalChunks.sort((a, b) => a.startTime - b.startTime);
      steps[3].status = 'complete';
      steps[3].additionalChunks = additionalChunks.length;
      steps[3].reason = verification.contradiction_details || 'Low confidence in initial context';
    }

    // ====================================================
    // STEP 5: Generate final response with full context
    // ====================================================
    const finalStep = {
      step: steps.length + 1,
      action: 'generate_response',
      status: 'running',
    };
    steps.push(finalStep);

    const allTranscripts = [...transcriptChunks, ...additionalChunks];

    // Build enriched system prompt
    let systemPrompt = buildRAGSystemPrompt(allTranscripts, visualChunks);

    // Add agent instructions
    if (verification.has_contradiction) {
      systemPrompt += `\n<agent_note>
IMPORTANT: The Smart Agent detected a contradiction in the retrieved context:
"${verification.contradiction_details}"
You MUST acknowledge this discrepancy in your answer. Cross-reference the timestamps 
to explain when/why the information changed. Be transparent about conflicting data.
</agent_note>\n`;
    }

    if (additionalChunks.length > 0) {
      systemPrompt += `\n<additional_context>
The following additional context was retrieved after the initial search to resolve 
gaps or contradictions:
${additionalChunks.map((c) => `[${formatTimestamp(c.startTime)}] ${c.speakerId}: ${c.text}`).join('\n')}
</additional_context>\n`;
    }

    const messages = [
      ...chatHistory.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ];

    const response = await generate(systemPrompt, messages, { provider });

    finalStep.status = 'complete';

    // Extract timestamps
    const timestampRegex = /\[(\d{1,2}:\d{2})\]/g;
    const referencedTimestamps = [];
    let match;
    while ((match = timestampRegex.exec(response)) !== null) {
      const [mins, secs] = match[1].split(':').map(Number);
      referencedTimestamps.push({
        time: mins * 60 + secs,
        label: match[0],
      });
    }

    return {
      response,
      steps,
      isAgentic: true,
      contradictionDetected: verification.has_contradiction,
      contradictionDetails: verification.contradiction_details,
      retrievedChunks: allTranscripts.map((c) => ({
        chunkId: c._id,
        text: c.text,
        speakerId: c.speakerId,
        startTime: c.startTime,
        endTime: c.endTime,
      })),
      retrievedFrames: visualChunks.map((f) => ({
        frameId: f._id,
        description: f.description,
        timestamp: f.timestamp,
      })),
      referencedTimestamps,
      searchMetadata: {
        totalSteps: steps.length,
        searchLatencyMs: Date.now() - startTime,
        usedFollowupSearch: additionalChunks.length > 0,
      },
    };
  } catch (error) {
    logger.error(`Smart Agent failed: ${error.message}`);
    throw error;
  }
};

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

module.exports = { agenticQuery };
