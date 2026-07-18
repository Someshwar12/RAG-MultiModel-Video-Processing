import React, { useEffect, useState, useRef } from 'react';
import { FileText, Search, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { transcriptApi } from '@services/api';
import useAppStore from '@context/store';

function formatTs(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

const FACT_ICONS = {
  contradicted: { icon: AlertTriangle, color: 'text-accent-rose', bg: 'bg-accent-rose/[0.06]' },
  verified: { icon: CheckCircle2, color: 'text-accent-emerald', bg: 'bg-accent-emerald/[0.06]' },
  unverifiable: { icon: HelpCircle, color: 'text-slate-500', bg: 'bg-surface-300/30' },
};

export default function TranscriptPanel({ videoId }) {
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const { videoPlayerTime, setVideoPlayerTime } = useAppStore();
  const activeRef = useRef(null);

  useEffect(() => {
    if (!videoId) return;
    const load = async () => {
      setLoading(true);
      try {
        const result = await transcriptApi.get(videoId, { limit: 500 });
        setChunks(result.data || []);
      } catch (e) {
        console.error('Failed to load transcript:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [videoId]);

  // Auto-scroll to current timestamp
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [videoPlayerTime]);

  const filteredChunks = searchQ
    ? chunks.filter((c) => c.text.toLowerCase().includes(searchQ.toLowerCase()))
    : chunks;

  const isActive = (chunk) => {
    return videoPlayerTime >= chunk.startTime && videoPlayerTime <= chunk.endTime;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-sky" />
            <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Transcript</span>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">{chunks.length} segments</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search transcript..."
            className="input-field !py-1.5 !pl-8 !text-xs"
          />
        </div>
      </div>

      {/* Transcript list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs font-mono text-slate-600">Loading transcript...</span>
          </div>
        ) : filteredChunks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <FileText className="w-6 h-6 text-slate-700 mb-2" />
            <p className="text-xs text-slate-600">{searchQ ? 'No results' : 'Transcript will appear after processing'}</p>
          </div>
        ) : (
          filteredChunks.map((chunk) => {
            const active = isActive(chunk);
            const factStyle = FACT_ICONS[chunk.factCheckStatus];

            return (
              <div
                key={chunk._id || chunk.chunkIndex}
                ref={active ? activeRef : null}
                onClick={() => setVideoPlayerTime(chunk.startTime)}
                className={`group rounded-lg px-3 py-2 cursor-pointer transition-all ${
                  active
                    ? 'bg-brand-400/[0.06] border border-brand-400/15'
                    : 'hover:bg-surface-300/30 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-mono text-brand-400/70">{formatTs(chunk.startTime)}</span>
                  <span className="text-[10px] font-semibold text-slate-400">{chunk.speakerLabel || chunk.speakerId}</span>
                  {factStyle && chunk.factCheckStatus !== 'unchecked' && (
                    <div className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded ${factStyle.bg}`}>
                      <factStyle.icon className={`w-2.5 h-2.5 ${factStyle.color}`} />
                      <span className={`text-[8px] font-mono ${factStyle.color}`}>{chunk.factCheckStatus}</span>
                    </div>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${active ? 'text-slate-200' : 'text-slate-400'}`}>
                  {chunk.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
