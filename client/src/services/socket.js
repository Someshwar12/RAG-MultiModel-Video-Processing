// client/src/services/socket.js
// ============================================================
// Socket.IO Client — Real-time processing updates
// Connects to the Express backend for live pipeline progress
// ============================================================

import { io } from 'socket.io-client';

let socket = null;

/**
 * Initialize Socket.IO connection.
 * Called once when the app mounts.
 */
export const initSocket = () => {
  if (socket?.connected) return socket;

  socket = io('/', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
};

/**
 * Get the active socket instance.
 */
export const getSocket = () => {
  if (!socket) return initSocket();
  return socket;
};

/**
 * Join a video-specific room to receive processing updates.
 * @param {string} videoId
 */
export const joinVideoRoom = (videoId) => {
  const s = getSocket();
  s.emit('join:video', videoId);
};

/**
 * Leave a video room.
 * @param {string} videoId
 */
export const leaveVideoRoom = (videoId) => {
  const s = getSocket();
  s.emit('leave:video', videoId);
};

/**
 * Subscribe to processing progress events for a video.
 * @param {Function} callback - Called with { videoId, pipeline, stage, progress, message }
 * @returns {Function} - Unsubscribe function
 */
export const onProcessingProgress = (callback) => {
  const s = getSocket();
  s.on('processing:progress', callback);
  return () => s.off('processing:progress', callback);
};

/**
 * Disconnect and clean up.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default {
  initSocket,
  getSocket,
  joinVideoRoom,
  leaveVideoRoom,
  onProcessingProgress,
  disconnectSocket,
};
