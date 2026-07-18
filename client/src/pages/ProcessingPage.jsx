import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, AudioLines, Eye, Database, BarChart3, ShieldCheck, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { videoApi } from '@services/api';
import useProcessing from '@hooks/useProcessing';
import useAppStore from '@context/store';

const PIPELINES = [
  { key: 'audio',     label: 'Audio Transcription',  sub: 'Whisper API + Pyannote Diarization', icon: AudioLines,  color: 'text-accent-sky',     ring: 'border-accent-sky' },
  { key: 'visual',    label: 'Visual Encoding',       sub: 'Frame Extraction + VLM Analysis',    icon: Eye,         color: 'text-accent-violet',  ring: 'border-accent-violet' },
  { key: 'embedding', label: 'Vector Indexing',        sub: 'Embedding + Pinecone Upsert',       icon: Database,    color: 'text-brand-400',      ring: 'border-brand-400' },
  { key: 'sentiment', label: 'Sentiment Analysis',     sub: 'Mood Map Generation',               icon: BarChart3,   color: 'text-accent-emerald', ring: 'border-accent-emerald' },
  { key: 'factCheck', label: 'Fact Verification',      sub: 'Bullshit Detector + Tavily',        icon: ShieldCheck, color: 'text-accent-rose',    ring: 'border-accent-rose' },
];

function CircularProgress({ value, size = 160 }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke="url(#progressGrad)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d4943a" />
            <stop offset="100%" stopColor="#e8b96e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-white font-mono">{Math.round(value)}%</span>
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">
          {value >= 100 ? 'Complete' : 'Processing'}
        </span>
      </div>
    </div>
  );
}

function PipelineCard({ config, state }) {
  const { label, sub, icon: Icon, color, ring } = config;
  const progress = state?.progress || 0;
  const message = state?.message || '';
  const isComplete = progress >= 100;
  const isActive = progress > 0 && progress < 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl p-5 transition-all duration-500
        ${isActive ? 'border-glow' : ''}
        ${isComplete ? 'opacity-80' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-surface-300/50 flex items-center justify-center
            ${isActive ? ring + '/30 border' : ''}`}>
            {isComplete ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-accent-emerald" />
            ) : isActive ? (
              <Icon className={`w-4.5 h-4.5 ${color} animate-pulse`} />
            ) : (
              <Icon className="w-4.5 h-4.5 text-slate-600" />
            )}
          </div>
          <div>
            <h4 className={`text-sm font-semibold ${isComplete ? 'text-slate-400' : 'text-white'}`}>{label}</h4>
            <p className="text-[10px] text-slate-600 font-mono">{sub}</p>
          </div>
        </div>
        <span className={`text-xs font-mono font-semibold ${isComplete ? 'text-accent-emerald' : isActive ? color : 'text-slate-700'}`}>
          {isComplete ? 'DONE' : isActive ? `${progress}%` : 'QUEUED'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-400/30 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isComplete ? 'bg-accent-emerald/60' : 'bg-brand-400/70'}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Status message */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.p
            key={message}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[11px] text-slate-500 mt-2 truncate font-mono"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ProcessingPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { processingState, startProcessing, overallProgress, isComplete } = useProcessing(videoId);
  const { updateProcessingState } = useAppStore();
  const [video, setVideo] = useState(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const loadVideo = async () => {
      try {
        const result = await videoApi.get(videoId);
        setVideo(result.data);

        if (result.data.status === 'completed') {
          navigate(`/dashboard/${videoId}`);
          return;
        }

        if (result.data.status !== 'processing' && !started) {
          await startProcessing();
          setStarted(true);
        } else {
          setStarted(true);
        }
      } catch (err) {
        console.error('Failed to load video:', err);
      }
    };
    loadVideo();
  }, [videoId]);

  // POLLING FALLBACK: Chrome throttles Socket.IO in background tabs.
  // Polls server every 3 seconds. Only updates progress UPWARD to avoid
  // fighting with more granular Socket.IO updates.
  useEffect(() => {
    if (!videoId || isComplete) return;

    const poll = setInterval(async () => {
      try {
        const result = await videoApi.get(videoId);
        if (!result.data) return;

        setVideo(result.data);

        // Only sync if the DB progress is HIGHER than current UI progress
        const stages = result.data.processingPipeline || {};
        for (const [key, stage] of Object.entries(stages)) {
          if (stage && typeof stage.progress === 'number') {
            const currentProgress = processingState[key]?.progress || 0;
            // Only update upward — don't let DB overwrite faster Socket.IO updates
            if (stage.progress > currentProgress) {
              updateProcessingState(key, {
                stage: stage.stage || 'processing',
                progress: stage.progress,
                message: stage.message || '',
              });
            }
          }
        }

        if (result.data.status === 'completed') {
          navigate(`/dashboard/${videoId}`);
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [videoId, isComplete, processingState]);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => navigate(`/dashboard/${videoId}`), 2000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, videoId, navigate]);

  return (
    <div className="min-h-screen bg-surface-50 bg-noise bg-grid flex items-center justify-center p-6">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-400/[0.02] blur-[150px]" />
      </div>

      <div className="relative w-full max-w-4xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 badge mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            DATA INGESTION PHASE
          </div>
          <h1 className="font-display text-3xl md:text-4xl text-white mb-2">
            {isComplete ? 'Analysis Complete' : 'Processing Your Video'}
          </h1>
          {video && (
            <p className="text-sm text-slate-500 font-mono truncate max-w-md mx-auto">{video.title || video.originalFilename}</p>
          )}
        </motion.div>

        {/* Main layout: pipelines + progress ring */}
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Pipeline cards */}
          <div className="flex-1 w-full space-y-3">
            {PIPELINES.map((p, i) => (
              <PipelineCard key={p.key} config={p} state={processingState[p.key]} />
            ))}
          </div>

          {/* Central progress ring */}
          <div className="flex-shrink-0 flex flex-col items-center gap-6">
            <CircularProgress value={overallProgress} />

            {/* Video meta */}
            {video && (
              <div className="glass rounded-xl p-4 w-48 text-center space-y-2">
                <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Video Stats</div>
                {video.duration && (
                  <div className="text-xs text-slate-400">
                    Duration: <span className="text-white font-mono">{Math.floor(video.duration / 60)}m {Math.floor(video.duration % 60)}s</span>
                  </div>
                )}
                {video.resolution?.width && (
                  <div className="text-xs text-slate-400">
                    Resolution: <span className="text-white font-mono">{video.resolution.width}×{video.resolution.height}</span>
                  </div>
                )}
                <div className="text-xs text-slate-400">
                  Size: <span className="text-white font-mono">{(video.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              </div>
            )}

            {isComplete && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => navigate(`/dashboard/${videoId}`)}
                className="btn-primary"
              >
                Open Dashboard <Play className="w-4 h-4 fill-surface-0" />
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}