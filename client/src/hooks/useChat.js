// client/src/hooks/useChat.js
// ============================================================
// useChat Hook — RAG Chat & Virtual Participant Interface
// Manages sending messages, receiving responses, and session state
// AUTO-SEEKS video to first referenced timestamp on AI response
// ============================================================

import { useCallback } from 'react';
import { chatApi } from '../services/api';
import useAppStore from '../context/store';

export const useChat = (videoId) => {
  const {
    chatMessages,
    chatSessionId,
    isChatLoading,
    activeSpeakerId,
    llmProvider,
    addChatMessage,
    setChatSessionId,
    setChatLoading,
    setChatMessages,
    setVideoPlayerTime,
    clearChat,
  } = useAppStore();

  /**
   * Send a general RAG chat message.
   */
  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || isChatLoading) return;

      // Add user message to UI immediately
      addChatMessage({
        role: 'user',
        content: message,
        sentAt: new Date().toISOString(),
      });

      setChatLoading(true);

      try {
        let result;

        if (activeSpeakerId) {
          // Virtual Participant mode — Scoped RAG
          result = await chatApi.chatWithPersona(
            videoId,
            message,
            activeSpeakerId,
            {
              sessionId: chatSessionId,
              provider: llmProvider,
            }
          );
        } else {
          // General RAG chat
          result = await chatApi.sendMessage(videoId, message, {
            sessionId: chatSessionId,
            provider: llmProvider,
          });
        }

        // Update session ID if new
        if (result.data?.sessionId && !chatSessionId) {
          setChatSessionId(result.data.sessionId);
        }

        // Add assistant response to UI
        addChatMessage({
          role: 'assistant',
          content: result.data.response,
          retrievedChunks: result.data.retrievedChunks,
          retrievedFrames: result.data.retrievedFrames,
          referencedTimestamps: result.data.referencedTimestamps,
          factCheckAlert: result.data.factCheckAlert,
          persona: result.data.persona,
          sentAt: new Date().toISOString(),
        });

        // AUTO-SEEK: Jump video to the first referenced timestamp
        const firstTimestamp = result.data?.referencedTimestamps?.[0]?.time;
        if (firstTimestamp !== undefined && firstTimestamp !== null) {
          // Small delay so UI settles before seeking
          setTimeout(() => setVideoPlayerTime(firstTimestamp), 300);
        } else if (result.data?.retrievedChunks?.[0]?.startTime !== undefined) {
          // Fallback: seek to first retrieved transcript chunk
          setTimeout(() => setVideoPlayerTime(result.data.retrievedChunks[0].startTime), 300);
        }
      } catch (error) {
        addChatMessage({
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
          sentAt: new Date().toISOString(),
          isError: true,
        });
      } finally {
        setChatLoading(false);
      }
    },
    [videoId, chatSessionId, activeSpeakerId, llmProvider, isChatLoading]
  );

  /**
   * Load a previous chat session.
   */
  const loadSession = useCallback(
    async (sessionId) => {
      try {
        setChatLoading(true);
        const result = await chatApi.getSession(videoId, sessionId);

        if (result.data) {
          setChatMessages(result.data.messages || []);
          setChatSessionId(sessionId);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setChatLoading(false);
      }
    },
    [videoId]
  );

  /**
   * Start a new chat session.
   */
  const newSession = useCallback(() => {
    clearChat();
  }, []);

  return {
    messages: chatMessages,
    isLoading: isChatLoading,
    sessionId: chatSessionId,
    activeSpeakerId,
    sendMessage,
    loadSession,
    newSession,
    clearChat,
  };
};

export default useChat;
