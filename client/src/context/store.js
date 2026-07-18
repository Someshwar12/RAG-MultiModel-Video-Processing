// client/src/context/store.js
// ============================================================
// Zustand Global Store — Application State Management
// Manages video data, chat sessions, processing state,
// LLM provider toggle, and UI state
// ============================================================

import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // ============================================================
  // VIDEO STATE
  // ============================================================
  videos: [],
  currentVideo: null,
  isLoadingVideos: false,

  setVideos: (videos) => set({ videos }),
  setCurrentVideo: (video) => set({ currentVideo: video }),
  setLoadingVideos: (loading) => set({ isLoadingVideos: loading }),

  updateVideoProgress: (videoId, progressData) =>
    set((state) => ({
      currentVideo:
        state.currentVideo?._id === videoId
          ? { ...state.currentVideo, ...progressData }
          : state.currentVideo,
    })),

  // ============================================================
  // PROCESSING STATE (for Loading/Processing page)
  // ============================================================
  processingState: {
    audio: { stage: 'queued', progress: 0, message: '' },
    visual: { stage: 'queued', progress: 0, message: '' },
    embedding: { stage: 'queued', progress: 0, message: '' },
    sentiment: { stage: 'queued', progress: 0, message: '' },
    factCheck: { stage: 'queued', progress: 0, message: '' },
    overall: 0,
  },

  updateProcessingState: (pipeline, data) =>
    set((state) => {
      const newPipeline = {
        ...state.processingState,
        [pipeline]: {
          ...state.processingState[pipeline],
          ...data,
        },
      };

      // Recalculate overall
      const weights = { audio: 30, visual: 30, embedding: 20, sentiment: 10, factCheck: 10 };
      let totalWeighted = 0;
      let totalWeight = 0;
      for (const [key, weight] of Object.entries(weights)) {
        totalWeighted += (newPipeline[key]?.progress || 0) * weight;
        totalWeight += weight;
      }
      newPipeline.overall = Math.round(totalWeighted / totalWeight);

      return { processingState: newPipeline };
    }),

  resetProcessingState: () =>
    set({
      processingState: {
        audio: { stage: 'queued', progress: 0, message: '' },
        visual: { stage: 'queued', progress: 0, message: '' },
        embedding: { stage: 'queued', progress: 0, message: '' },
        sentiment: { stage: 'queued', progress: 0, message: '' },
        factCheck: { stage: 'queued', progress: 0, message: '' },
        overall: 0,
      },
    }),

  // ============================================================
  // CHAT STATE
  // ============================================================
  chatMessages: [],
  chatSessionId: null,
  isChatLoading: false,
  activeSpeakerId: null, // For Virtual Participant mode

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),

  setChatMessages: (messages) => set({ chatMessages: messages }),
  setChatSessionId: (id) => set({ chatSessionId: id }),
  setChatLoading: (loading) => set({ isChatLoading: loading }),
  setActiveSpeakerId: (id) => set({ activeSpeakerId: id }),

  clearChat: () =>
    set({
      chatMessages: [],
      chatSessionId: null,
      activeSpeakerId: null,
    }),

  // ============================================================
  // LLM PROVIDER TOGGLE
  // ============================================================
  llmProvider: 'llama', // 'openai' | 'llama' — defaults to llama for local mode
  setLlmProvider: (provider) => set({ llmProvider: provider }),

  // ============================================================
  // MOOD MAP STATE
  // ============================================================
  sentimentTimeline: [],
  sentimentSpikes: [],
  setSentimentTimeline: (data) => set({ sentimentTimeline: data }),
  setSentimentSpikes: (data) => set({ sentimentSpikes: data }),

  // ============================================================
  // UI STATE
  // ============================================================
  sidebarCollapsed: false,
  videoPlayerTime: 0, // Current playback time in seconds
  activePanel: 'chat', // 'chat' | 'transcript' | 'actions'

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setVideoPlayerTime: (time) => set({ videoPlayerTime: time }),
  setActivePanel: (panel) => set({ activePanel: panel }),
}));

export default useAppStore;
