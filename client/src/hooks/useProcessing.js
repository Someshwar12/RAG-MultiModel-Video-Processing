// client/src/hooks/useProcessing.js
// ============================================================
// useProcessing Hook — Manages video processing lifecycle
// Connects to Socket.IO for real-time pipeline progress
// ============================================================

import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { videoApi } from '../services/api';
import {
  joinVideoRoom,
  leaveVideoRoom,
  onProcessingProgress,
} from '../services/socket';
import useAppStore from '../context/store';

export const useProcessing = (videoId) => {
  const navigate = useNavigate();
  const {
    processingState,
    updateProcessingState,
    resetProcessingState,
    setCurrentVideo,
  } = useAppStore();

  // Subscribe to Socket.IO progress events
  useEffect(() => {
    if (!videoId) return;

    joinVideoRoom(videoId);

    const unsubscribe = onProcessingProgress((data) => {
      if (data.videoId !== videoId) return;

      if (data.pipeline === 'all' && data.stage === 'completed') {
        // Processing complete — navigate to dashboard
        setTimeout(() => {
          navigate(`/dashboard/${videoId}`);
        }, 1500);
        return;
      }

      if (data.pipeline && data.pipeline !== 'all') {
        updateProcessingState(data.pipeline, {
          stage: data.stage,
          progress: data.progress,
          message: data.message,
        });
      }
    });

    return () => {
      leaveVideoRoom(videoId);
      unsubscribe();
    };
  }, [videoId]);

  // Start processing
  const startProcessing = useCallback(async () => {
    if (!videoId) return;

    resetProcessingState();

    try {
      await videoApi.triggerProcessing(videoId);
    } catch (error) {
      console.error('Failed to start processing:', error);
      throw error;
    }
  }, [videoId]);

  // Poll video status as fallback
  const refreshVideoStatus = useCallback(async () => {
    if (!videoId) return;

    try {
      const result = await videoApi.get(videoId);
      if (result.data) {
        setCurrentVideo(result.data);
      }
    } catch (error) {
      console.error('Failed to refresh video status:', error);
    }
  }, [videoId]);

  return {
    processingState,
    startProcessing,
    refreshVideoStatus,
    overallProgress: processingState.overall,
    isComplete: processingState.overall === 100,
  };
};

export default useProcessing;
