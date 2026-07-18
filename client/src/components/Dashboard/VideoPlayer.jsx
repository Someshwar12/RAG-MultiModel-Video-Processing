import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import useAppStore from '@context/store';

function formatTime(s) {
  if (!s || isNaN(s)) return '00:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function VideoPlayer({ videoUrl }) {
  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume] = useState(0.8);

  const { setVideoPlayerTime, videoPlayerTime } = useAppStore();

  // External seek (from chat timestamp clicks AND auto-seek on AI response)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || videoPlayerTime === undefined || videoPlayerTime === null) return;

    // Skip if already at the requested time (within 0.5s tolerance)
    if (Math.abs(v.currentTime - videoPlayerTime) < 0.5) return;

    const seek = () => {
      v.currentTime = videoPlayerTime;
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setPlaying(true)).catch(() => {
          // Autoplay blocked — just seek without playing
          setPlaying(false);
        });
      }
    };

    if (v.readyState >= 2) {
      seek();
    } else {
      const handler = () => { seek(); v.removeEventListener('loadedmetadata', handler); };
      v.addEventListener('loadedmetadata', handler);
    }
  }, [videoPlayerTime]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); } else { videoRef.current.play(); }
    setPlaying(!playing);
  };

  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrent(videoRef.current.currentTime);
  };

  const onSeek = (e) => {
    if (!progressRef.current || !videoRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoRef.current.currentTime = pct * duration;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else { videoRef.current.requestFullscreen?.(); }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Media Player</span>
        </div>
        <span className="text-[11px] font-mono text-slate-600">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-surface-0 cursor-pointer group min-h-0" onClick={togglePlay}>
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onEnded={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            volume={volume}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-brand-400/10 border border-brand-400/20 flex items-center justify-center mb-3">
              <Play className="w-7 h-7 text-brand-400 fill-brand-400/30 ml-0.5" />
            </div>
            <span className="text-xs font-mono text-slate-600">No video loaded</span>
          </div>
        )}

        {/* Play/pause overlay */}
        {videoUrl && !playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-0/30">
            <div className="w-14 h-14 rounded-full bg-brand-400/20 border border-brand-400/30 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-6 h-6 text-brand-400 fill-brand-400/40 ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="px-3 py-2 border-t border-white/[0.04] bg-surface-200/50 flex-shrink-0">
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-1.5 bg-surface-400/30 rounded-full mb-2 cursor-pointer group/prog"
          onClick={onSeek}
        >
          <div
            className="h-full bg-brand-400/70 rounded-full relative transition-all duration-100"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand-400 opacity-0 group-hover/prog:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="btn-ghost !p-1.5 !rounded-lg">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button onClick={toggleMute} className="btn-ghost !p-1.5 !rounded-lg">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="text-[10px] font-mono text-slate-500 ml-1">
              {formatTime(currentTime)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleFullscreen} className="btn-ghost !p-1.5 !rounded-lg">
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
