import React from 'react';
import { Users, Clock, Layers, AlertTriangle, ShieldCheck, FileCode2, Loader2 } from 'lucide-react';

function formatDuration(s) {
  if (!s) return '--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}m ${sec}s`;
}

export default function InfoBar({ video, onRunFactCheck, onDigitalizeAll, factCheckLoading }) {
  if (!video) return null;

  const stats = video.stats || {};

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.04]">
        <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Video Info</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Title */}
        <div>
          <p className="text-sm font-semibold text-white truncate">{video.title}</p>
          <p className="text-[10px] text-slate-600 font-mono truncate">{video.originalFilename}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Clock, label: 'Duration', value: formatDuration(video.duration) },
            { icon: Users, label: 'Speakers', value: stats.totalSpeakers || 0 },
            { icon: Layers, label: 'Chunks', value: stats.totalTranscriptChunks || 0 },
            { icon: Layers, label: 'Frames', value: stats.totalKeyframes || 0 },
          ].map((s) => (
            <div key={s.label} className="glass rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className="w-3 h-3 text-slate-600" />
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">{s.label}</span>
              </div>
              <span className="text-sm font-mono font-semibold text-white">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Speakers */}
        {video.speakerProfiles?.length > 0 && (
          <div>
            <h4 className="section-label mb-2">Speakers</h4>
            <div className="space-y-1.5">
              {video.speakerProfiles.map((sp) => (
                <div key={sp.speakerId} className="flex items-center justify-between glass rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-brand-400/10 flex items-center justify-center">
                      <span className="text-[9px] font-mono text-brand-400">
                        {(sp.label || sp.speakerId).slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-white font-medium">{sp.label || sp.speakerId}</span>
                      {sp.role && <span className="text-[9px] text-slate-500 ml-1.5">({sp.role})</span>}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-slate-600">{Math.round(sp.totalSpeakingTime || 0)}s</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fact-check stats */}
        {(stats.totalFactChecks > 0 || stats.contradictionsFound > 0) && (
          <div>
            <h4 className="section-label mb-2">Fact checks</h4>
            <div className="flex gap-2">
              <div className="flex-1 glass rounded-lg p-2.5 text-center">
                <ShieldCheck className="w-3.5 h-3.5 text-accent-emerald mx-auto mb-1" />
                <span className="text-xs font-mono text-white block">{(stats.totalFactChecks || 0) - (stats.contradictionsFound || 0)}</span>
                <span className="text-[8px] text-slate-600 uppercase">Verified</span>
              </div>
              <div className="flex-1 glass rounded-lg p-2.5 text-center">
                <AlertTriangle className="w-3.5 h-3.5 text-accent-rose mx-auto mb-1" />
                <span className="text-xs font-mono text-white block">{stats.contradictionsFound || 0}</span>
                <span className="text-[8px] text-slate-600 uppercase">Flagged</span>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          <h4 className="section-label mb-2">Actions</h4>
          <button
            onClick={onRunFactCheck}
            disabled={factCheckLoading}
            className="btn-secondary w-full !text-xs !justify-center disabled:opacity-40"
          >
            {factCheckLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {factCheckLoading ? 'Running...' : 'Run Bullshit Detector'}
          </button>
          <button
            onClick={onDigitalizeAll}
            className="btn-secondary w-full !text-xs !justify-center"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            Digitalize All Diagrams
          </button>
        </div>
      </div>
    </div>
  );
}
