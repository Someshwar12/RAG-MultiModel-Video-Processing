import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, AlertTriangle, HelpCircle, Loader2, ExternalLink, Clock } from 'lucide-react';
import { agentApi, transcriptApi } from '@services/api';
import { onProcessingProgress } from '@services/socket';
import useAppStore from '@context/store';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FactCheckModal({ videoId, onClose }) {
  const [status, setStatus] = useState('starting'); // 'starting' | 'running' | 'complete' | 'error' | 'skipped'
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('Initializing Bullshit Detector...');
  const [factChecks, setFactChecks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const { setVideoPlayerTime } = useAppStore();

  useEffect(() => {
    let completed = false;

    // Function to fetch results once fact-check completes
    const fetchResults = async () => {
      try {
        const transcripts = await transcriptApi.getFactChecks(videoId);
        const checks = (transcripts.data || [])
          .filter((t) => t.factCheckDetails && t.factCheckDetails.verdict)
          .map((t) => ({
            claim: t.factCheckDetails.claim || t.text.slice(0, 200),
            verdict: t.factCheckDetails.verdict,
            evidence: t.factCheckDetails.evidence,
            sourceUrl: t.factCheckDetails.sourceUrl,
            correctedValue: t.factCheckDetails.correctedValue,
            timestamp: t.startTime,
            speakerId: t.speakerId,
          }));

        const verified = checks.filter((c) => c.verdict === 'VERIFIED').length;
        const contradicted = checks.filter((c) => c.verdict === 'CONTRADICTED').length;
        const unverifiable = checks.filter((c) => c.verdict === 'UNVERIFIABLE').length;

        setFactChecks(checks);
        setSummary({ verified, contradicted, unverifiable, total: checks.length });
        setStatus('complete');
        setProgress(100);
        setProgressMsg(`Analysis complete — ${checks.length} claims verified`);
      } catch (e) {
        // If no fact-checks exist yet, show empty state
        setFactChecks([]);
        setSummary({ verified: 0, contradicted: 0, unverifiable: 0, total: 0 });
        setStatus('complete');
      }
    };

    // Kick off the fact-check
    const run = async () => {
      try {
        setStatus('running');
        await agentApi.runFactCheck(videoId);
        // Don't fetch immediately — wait for socket 'completed' event
      } catch (e) {
        setStatus('error');
        setError(e.message || 'Bullshit Detector failed');
      }
    };
    run();

    // Live progress updates from Socket.IO
    const unsub = onProcessingProgress((data) => {
      if (data.videoId === videoId && data.pipeline === 'factCheck') {
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.message) setProgressMsg(data.message);

        // When fact-check completes, fetch the results from DB
        if (data.stage === 'completed' && !completed) {
          completed = true;
          fetchResults();
        }
      }
    });

    // Fallback: if socket never fires completed, poll after 30s
    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        fetchResults();
      }
    }, 30000);

    return () => { unsub(); clearTimeout(timeout); };
  }, [videoId]);

  const verdictStyle = (v) => {
    if (v === 'VERIFIED') return { icon: ShieldCheck, color: 'text-accent-emerald', bg: 'bg-accent-emerald/[0.06]', border: 'border-accent-emerald/15', label: 'Verified' };
    if (v === 'CONTRADICTED') return { icon: AlertTriangle, color: 'text-accent-rose', bg: 'bg-accent-rose/[0.06]', border: 'border-accent-rose/15', label: 'Contradicted' };
    return { icon: HelpCircle, color: 'text-slate-500', bg: 'bg-surface-300/40', border: 'border-white/[0.04]', label: 'Unverifiable' };
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-surface-100 border border-white/[0.06] rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.04] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-rose/10 border border-accent-rose/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-accent-rose" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Bullshit Detector</h2>
              <p className="text-[11px] text-slate-500">Automated claim verification via web search + LLM judge</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 !rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress (shown while running) */}
        {(status === 'starting' || status === 'running') && (
          <div className="px-5 py-4 border-b border-white/[0.04] flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
              <span className="text-xs text-slate-300">{progressMsg}</span>
              <span className="text-[11px] font-mono text-brand-400 ml-auto">{progress}%</span>
            </div>
            <div className="h-1 bg-surface-400/30 rounded-full overflow-hidden">
              <div className="h-full bg-brand-400 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              The system is extracting verifiable claims from the transcript, searching the web for evidence via Tavily, and cross-referencing each claim with trusted sources. This may take 1-3 minutes depending on the number of claims.
            </p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="px-5 py-6 flex-shrink-0">
            <div className="flex items-center gap-2 text-accent-rose">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Error: {error}</span>
            </div>
          </div>
        )}

        {/* Skipped (no Tavily key) */}
        {status === 'skipped' && (
          <div className="px-5 py-8 flex-shrink-0 text-center">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-1">Fact-checking unavailable</p>
            <p className="text-[11px] text-slate-600">{error || 'A Tavily API key is required for web-based fact verification. Set TAVILY_API_KEY in server/.env to enable this feature.'}</p>
            <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-accent-sky hover:underline mt-3">
              Get free Tavily API key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Summary bar (shown when complete) */}
        {status === 'complete' && summary && (
          <div className="px-5 py-3 border-b border-white/[0.04] flex-shrink-0 grid grid-cols-4 gap-3">
            <div className="glass rounded-lg px-3 py-2">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Total Claims</div>
              <div className="text-lg font-mono font-semibold text-white">{summary.total}</div>
            </div>
            <div className="glass rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[9px] text-accent-emerald uppercase tracking-wider mb-0.5">
                <ShieldCheck className="w-3 h-3" /> Verified
              </div>
              <div className="text-lg font-mono font-semibold text-accent-emerald">{summary.verified}</div>
            </div>
            <div className="glass rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[9px] text-accent-rose uppercase tracking-wider mb-0.5">
                <AlertTriangle className="w-3 h-3" /> Contradicted
              </div>
              <div className="text-lg font-mono font-semibold text-accent-rose">{summary.contradicted}</div>
            </div>
            <div className="glass rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
                <HelpCircle className="w-3 h-3" /> Unverifiable
              </div>
              <div className="text-lg font-mono font-semibold text-slate-400">{summary.unverifiable}</div>
            </div>
          </div>
        )}

        {/* Claims list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {status === 'complete' && factChecks.length === 0 && (
            <div className="text-center py-16">
              <HelpCircle className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-1">No verifiable claims detected</p>
              <p className="text-[11px] text-slate-600 max-w-md mx-auto">
                The transcript does not contain specific factual statements (statistics, named facts, historical claims) that can be independently verified against external sources. Opinion-based content, discussions, and conversational speech are not fact-checked.
              </p>
            </div>
          )}

          {factChecks.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 mb-3">
                Click any timestamp to jump to that moment in the video. Contradicted claims include the correct value and source reference.
              </p>
              {factChecks.map((fc, i) => {
                const s = verdictStyle(fc.verdict);
                return (
                  <div key={i} className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
                    {/* Verdict badge + timestamp */}
                    <div className="flex items-center justify-between mb-2">
                      <div className={`flex items-center gap-1.5 ${s.color}`}>
                        <s.icon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{s.label}</span>
                      </div>
                      <button
                        onClick={() => setVideoPlayerTime(fc.timestamp)}
                        className="flex items-center gap-1 text-[10px] font-mono text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        <Clock className="w-3 h-3" />
                        [{formatTime(fc.timestamp)}]
                        <span className="text-slate-600 ml-1">{fc.speakerId}</span>
                      </button>
                    </div>

                    {/* Claim */}
                    <p className="text-sm text-slate-200 mb-3 leading-relaxed">
                      <span className="text-[10px] text-slate-600 mr-2 uppercase tracking-wider">Claim</span>
                      "{fc.claim}"
                    </p>

                    {/* Evidence */}
                    {fc.evidence && (
                      <div className="border-t border-white/[0.04] pt-3 mb-2">
                        <p className="text-[10px] text-slate-600 mb-1 uppercase tracking-wider">Evidence</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{fc.evidence}</p>
                      </div>
                    )}

                    {/* Corrected value */}
                    {fc.correctedValue && (
                      <div className="border-t border-white/[0.04] pt-2 mb-2">
                        <p className="text-[10px] text-accent-emerald mb-1 uppercase tracking-wider">Correct Value</p>
                        <p className="text-xs text-accent-emerald font-medium">{fc.correctedValue}</p>
                      </div>
                    )}

                    {/* Source */}
                    {fc.sourceUrl && (
                      <a
                        href={fc.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent-sky hover:underline mt-1"
                      >
                        View source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
