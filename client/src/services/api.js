// client/src/services/api.js
// ============================================================
// Zeta API Client — Axios wrapper for all backend endpoints
// All calls proxied through Vite dev server → localhost:5000
// ============================================================

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min timeout for long RAG queries
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Response interceptor for error handling ---
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.message ||
      'Something went wrong';
    console.error('[API Error]', message);
    return Promise.reject(new Error(message));
  }
);

// ============================================================
// VIDEO ENDPOINTS
// ============================================================

export const videoApi = {
  /**
   * Upload a video file with optional metadata.
   * @param {File} file - The video file
   * @param {Object} [meta] - { title, description, tags }
   * @param {Function} [onProgress] - Upload progress callback (0-100)
   */
  upload: (file, meta = {}, onProgress) => {
    const formData = new FormData();
    formData.append('video', file);
    if (meta.title) formData.append('title', meta.title);
    if (meta.description) formData.append('description', meta.description);
    if (meta.tags) formData.append('tags', meta.tags);

    return api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 min for large uploads
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
  },

  /** Trigger the ML ingestion pipeline */
  triggerProcessing: (videoId) =>
    api.post(`/videos/${videoId}/process`),

  /** List all videos */
  list: (params = {}) =>
    api.get('/videos', { params }),

  /** Get video details */
  get: (videoId) =>
    api.get(`/videos/${videoId}`),

  /** Delete a video and all linked data */
  delete: (videoId) =>
    api.delete(`/videos/${videoId}`),

  /** Get speaker profiles */
  getSpeakers: (videoId) =>
    api.get(`/videos/${videoId}/speakers`),

  /** Label a speaker (name + role) */
  labelSpeaker: (videoId, speakerId, data) =>
    api.put(`/videos/${videoId}/speakers/${speakerId}`, data),
};

// ============================================================
// CHAT ENDPOINTS
// ============================================================

export const chatApi = {
  /**
   * Send a RAG chat message.
   * @param {string} videoId
   * @param {string} message
   * @param {Object} [options] - { sessionId, provider }
   */
  sendMessage: (videoId, message, options = {}) =>
    api.post(`/chat/${videoId}/message`, {
      message,
      ...options,
    }),

  /**
   * Chat with a Virtual Participant (Digital Twin).
   * @param {string} videoId
   * @param {string} message
   * @param {string} speakerId - e.g., "SPEAKER_00"
   * @param {Object} [options] - { sessionId, provider }
   */
  chatWithPersona: (videoId, message, speakerId, options = {}) =>
    api.post(`/chat/${videoId}/persona`, {
      message,
      speakerId,
      ...options,
    }),

  /** List chat sessions for a video */
  listSessions: (videoId) =>
    api.get(`/chat/${videoId}/sessions`),

  /** Get full session history */
  getSession: (videoId, sessionId) =>
    api.get(`/chat/${videoId}/sessions/${sessionId}`),

  /** Delete a session */
  deleteSession: (videoId, sessionId) =>
    api.delete(`/chat/${videoId}/sessions/${sessionId}`),
};

// ============================================================
// TRANSCRIPT ENDPOINTS
// ============================================================

export const transcriptApi = {
  /** Get full transcript (paginated) */
  get: (videoId, params = {}) =>
    api.get(`/transcripts/${videoId}`, { params }),

  /** Keyword search */
  search: (videoId, query) =>
    api.get(`/transcripts/${videoId}/search`, { params: { q: query } }),

  /** Get fact-check results */
  getFactChecks: (videoId, status) =>
    api.get(`/transcripts/${videoId}/factchecks`, {
      params: status ? { status } : {},
    }),

  /** Get extracted action items */
  getActionItems: (videoId) =>
    api.get(`/transcripts/${videoId}/actions`),
};

// ============================================================
// SENTIMENT / MOOD MAP ENDPOINTS
// ============================================================

export const sentimentApi = {
  /** Get full sentiment timeline */
  getTimeline: (videoId) =>
    api.get(`/sentiment/${videoId}/timeline`),

  /** Get only spike moments */
  getSpikes: (videoId) =>
    api.get(`/sentiment/${videoId}/spikes`),

  /** Get sentiment for a specific speaker */
  getSpeakerSentiment: (videoId, speakerId) =>
    api.get(`/sentiment/${videoId}/speaker/${speakerId}`),
};

// ============================================================
// HEALTH CHECK
// ============================================================

export const healthApi = {
  check: () => api.get('/health'),
};

// ============================================================
// AGENT ENDPOINTS (Agentic Workflows)
// ============================================================

export const agentApi = {
  /** Trigger the Bullshit Detector (async — results via Socket.IO) */
  runFactCheck: (videoId) =>
    api.post(`/agents/${videoId}/factcheck`),

  /** Digitalize a single whiteboard/diagram frame → Mermaid.js */
  digitalizeFrame: (videoId, frameId) =>
    api.post(`/agents/${videoId}/digitalize/${frameId}`),

  /** Batch digitalize all diagram frames in a video */
  digitalizeAll: (videoId) =>
    api.post(`/agents/${videoId}/digitalize-all`),

  /**
   * Smart Agent query — multi-step agentic RAG with self-verification.
   * Detects contradictions, performs followup searches, returns audit trail.
   */
  smartQuery: (videoId, message, options = {}) =>
    api.post(`/agents/${videoId}/smart-query`, { message, ...options }),
};

export default api;
