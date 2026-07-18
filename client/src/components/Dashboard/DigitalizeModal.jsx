import React, { useEffect, useState } from 'react';
import { X, FileCode2, Download, Loader2, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import useAppStore from '@context/store';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function DigitalizeModal({ videoId, onClose }) {
  const [status, setStatus] = useState('loading'); // loading | found | empty | downloading | done | error
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState(null);
  const { setVideoPlayerTime } = useAppStore();

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch all visual descriptions for this video
        const res = await fetch(`/api/agents/${videoId}/visual-frames`, {
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error || 'Failed to fetch frames');

        const allFrames = data.data || [];

        // Filter: frames that have diagrams, slides, text, code, charts, or non-trivial visual content
        const visualFrames = allFrames.filter((f) => {
          const d = f.detectedElements || {};
          return d.hasDiagram || d.hasWhiteboard || d.hasSlide || d.hasCode || d.hasChart || d.hasText;
        });

        if (visualFrames.length > 0) {
          setFrames(visualFrames);
          setStatus('found');
        } else {
          setStatus('empty');
        }
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
    };
    load();
  }, [videoId]);

  const handleDownloadPdf = async () => {
    setStatus('downloading');
    try {
      const res = await fetch(`/api/agents/${videoId}/diagrams-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('PDF generation failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagrams-${videoId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-surface-100 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-400/10 border border-brand-400/20 flex items-center justify-center">
              <FileCode2 className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Diagram Digitalizer</h2>
              <p className="text-[11px] text-slate-500">Extract visual frames (slides, diagrams, text) as PDF</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 !rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Scanning video frames for visual content...</p>
              <p className="text-[11px] text-slate-600 mt-1">Checking {frames.length || 'all'} extracted keyframes</p>
            </div>
          </div>
        )}

        {/* Empty — no diagrams */}
        {status === 'empty' && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center max-w-md">
              <ImageIcon className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-base text-slate-300 font-medium mb-2">No diagrams or slides detected</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                The AI analyzed all {frames.length || 'extracted'} keyframes from this video and determined the content is primarily speaker footage without significant visual aids like slides, whiteboards, diagrams, code snippets, or charts. Only videos containing visual educational content can be digitalized.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 text-accent-rose mx-auto mb-3" />
              <p className="text-sm text-accent-rose">{error || 'Something went wrong'}</p>
            </div>
          </div>
        )}

        {/* Done */}
        {status === 'done' && (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <Download className="w-10 h-10 text-accent-emerald mx-auto mb-3" />
              <p className="text-sm text-accent-emerald font-medium">PDF downloaded successfully!</p>
              <p className="text-[11px] text-slate-500 mt-1">{frames.length} visual frames exported</p>
            </div>
          </div>
        )}

        {/* Found frames — show grid + download button */}
        {(status === 'found' || status === 'downloading') && (
          <>
            {/* Summary bar */}
            <div className="px-5 py-3 border-b border-white/[0.04] flex-shrink-0 flex items-center justify-between">
              <div className="flex gap-3">
                <div className="glass rounded-lg px-3 py-1.5">
                  <span className="text-[9px] text-slate-600 uppercase">Frames Found</span>
                  <span className="text-sm font-mono font-semibold text-white block">{frames.length}</span>
                </div>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={status === 'downloading'}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-400 text-surface-0 text-xs font-medium hover:bg-brand-500 transition-colors disabled:opacity-50"
              >
                {status === 'downloading' ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating PDF...</>
                ) : (
                  <><Download className="w-3.5 h-3.5" /> Download as PDF</>
                )}
              </button>
            </div>

            {/* Frame grid */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
              <div className="grid grid-cols-3 gap-3">
                {frames.map((f, i) => {
                  const frameName = f.framePath ? f.framePath.replace(/\\/g, '/').split('/').pop() : '';
                  const thumbUrl = f.framePath ? `/uploads/frames/${videoId}/${frameName}` : null;

                  return (
                    <div
                      key={i}
                      className="glass rounded-lg overflow-hidden group cursor-pointer hover:border-brand-400/30 transition-colors border border-transparent"
                      onClick={() => setVideoPlayerTime(f.timestamp)}
                    >
                      {thumbUrl && (
                        <div className="aspect-video bg-surface-0 overflow-hidden">
                          <img
                            src={thumbUrl}
                            alt={`Frame at ${formatTime(f.timestamp)}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      )}
                      <div className="px-2.5 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-brand-400">[{formatTime(f.timestamp)}]</span>
                          <span className="text-[9px] text-slate-600 capitalize">{f.detectedElements?.sceneType || 'visual'}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{(f.description || '').slice(0, 80)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
