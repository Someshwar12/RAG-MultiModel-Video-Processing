// server/controllers/chatController.js
// ============================================================
// Chat Controller — RAG Chat & Virtual Participant
// ============================================================

const { ChatSession, Video, Transcript } = require('../models');
const { queryVideo } = require('../services/ragService');
const { generate, buildRAGSystemPrompt } = require('../services/llmService');
const logger = require('../utils/logger');

/**
 * POST /api/chat/:videoId/message
 * Send a message in general RAG chat mode.
 */
exports.sendMessage = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { message, sessionId, provider } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot be empty.',
      });
    }

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    // Find or create chat session
    let session;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
    }
    if (!session) {
      session = await ChatSession.create({
        videoId,
        userId: req.user._id,
        sessionType: 'general',
        title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
      });
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
    });

    // Build chat history for context
    const chatHistory = session.messages
      .filter((m) => m.role !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    // Execute RAG query
    const ragResult = await queryVideo({
      videoId,
      query: message,
      chatHistory,
      options: { provider },
    });

    // Add assistant response with RAG metadata
    session.messages.push({
      role: 'assistant',
      content: ragResult.response,
      ragContext: {
        retrievedChunks: ragResult.retrievedChunks,
        retrievedFrames: ragResult.retrievedFrames,
        searchMetadata: ragResult.searchMetadata,
      },
      referencedTimestamps: ragResult.referencedTimestamps,
    });

    await session.save();

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        response: ragResult.response,
        retrievedChunks: ragResult.retrievedChunks,
        retrievedFrames: ragResult.retrievedFrames,
        referencedTimestamps: ragResult.referencedTimestamps,
        provider: ragResult.searchMetadata?.provider,
      },
    });
  } catch (error) {
    logger.error(`Chat message failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate response.',
    });
  }
};

/**
 * POST /api/chat/:videoId/persona
 * Chat with a Virtual Participant (Digital Twin).
 * Uses Scoped RAG — only retrieves what that speaker said/heard.
 */
exports.chatWithPersona = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { message, speakerId, sessionId, provider } = req.body;

    if (!message || !speakerId) {
      return res.status(400).json({
        success: false,
        error: 'Both message and speakerId are required.',
      });
    }

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found.' });
    }

    // Find the speaker profile
    const speakerProfile = video.speakerProfiles?.find(
      (sp) => sp.speakerId === speakerId
    );

    if (!speakerProfile) {
      return res.status(404).json({
        success: false,
        error: `Speaker ${speakerId} not found in this video.`,
      });
    }

    // Generate behavioral profile if not already set
    if (!speakerProfile.behavioralProfile) {
      const speakerTranscripts = await Transcript.getSpeakerTranscripts(videoId, speakerId);
      const sampleText = speakerTranscripts
        .slice(0, 20)
        .map((t) => t.text)
        .join(' ');

      if (sampleText.length > 0) {
        const profilePrompt = `Analyze this person's speaking style from their transcript excerpts. 
Describe their communication style in 2-3 sentences: technical depth, formality level, 
common phrases, emotional tendency, and expertise area.

Transcript excerpts: "${sampleText.slice(0, 2000)}"

Respond with ONLY the behavioral profile description, nothing else.`;

        speakerProfile.behavioralProfile = await generate(
          'You are a communication analyst.',
          [{ role: 'user', content: profilePrompt }],
          { }
        );

        await video.save();
      }
    }

    // Find or create persona chat session
    let session;
    if (sessionId) {
      session = await ChatSession.findById(sessionId);
    }
    if (!session) {
      session = await ChatSession.create({
        videoId,
        userId: req.user._id,
        sessionType: 'virtual_participant',
        virtualParticipant: {
          speakerId,
          speakerLabel: speakerProfile.label || speakerId,
          role: speakerProfile.role || null,
          personaPrompt: speakerProfile.behavioralProfile || null,
        },
        title: `Chat with ${speakerProfile.label || speakerId}`,
      });
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: message,
    });

    const chatHistory = session.messages
      .filter((m) => m.role !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    // Execute Scoped RAG query (filtered to this speaker)
    const ragResult = await queryVideo({
      videoId,
      query: message,
      chatHistory,
      options: {
        provider,
        speakerId,
        persona: {
          speakerId,
          speakerLabel: speakerProfile.label || speakerId,
          role: speakerProfile.role || 'Participant',
          behavioralProfile: speakerProfile.behavioralProfile || '',
        },
      },
    });

    // Add assistant response
    session.messages.push({
      role: 'assistant',
      content: ragResult.response,
      ragContext: {
        retrievedChunks: ragResult.retrievedChunks,
        searchMetadata: ragResult.searchMetadata,
      },
      referencedTimestamps: ragResult.referencedTimestamps,
    });

    await session.save();

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        response: ragResult.response,
        persona: {
          speakerId,
          label: speakerProfile.label,
          role: speakerProfile.role,
        },
        retrievedChunks: ragResult.retrievedChunks,
        referencedTimestamps: ragResult.referencedTimestamps,
      },
    });
  } catch (error) {
    logger.error(`Persona chat failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate persona response.',
    });
  }
};

/**
 * GET /api/chat/:videoId/sessions
 */
exports.listSessions = async (req, res) => {
  try {
    const sessions = await ChatSession.find({
      videoId: req.params.videoId,
      userId: req.user._id,
    })
      .sort({ updatedAt: -1 })
      .select('title sessionType virtualParticipant messageCount createdAt updatedAt')
      .lean();

    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch sessions.' });
  }
};

/**
 * GET /api/chat/:videoId/sessions/:sessionId
 */
exports.getSession = async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId).lean();

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found.' });
    }

    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch session.' });
  }
};

/**
 * DELETE /api/chat/:videoId/sessions/:sessionId
 */
exports.deleteSession = async (req, res) => {
  try {
    await ChatSession.findByIdAndDelete(req.params.sessionId);
    res.json({ success: true, message: 'Session deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete session.' });
  }
};
