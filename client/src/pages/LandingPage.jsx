import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Upload, Play, Search, Brain, ShieldCheck, MessageSquareText, Users, Sparkles, ArrowRight, Zap, BarChart3, FileCode2, ChevronRight, X, AudioLines, Eye, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { videoApi } from '@services/api';

/* ── animation presets ── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

const fadeLeft = (delay = 0) => ({
  initial: { opacity: 0, x: -40 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.65, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

const fadeRight = (delay = 0) => ({
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.65, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

const scaleIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.55, delay, ease: [0.25, 0.46, 0.45, 0.94] },
});

const stagger = { animate: { transition: { staggerChildren: 0.08 } } };

/* ── HERO DASHBOARD ── */
function HeroDashboard() {
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState(0); // 0=empty, 1=typing, 2=question, 3=answer, 4=factcheck, 5=mood, 6=pause, then restart

  useEffect(() => {
    const timings = [800, 1200, 600, 1000, 800, 2500, 500]; // ms per phase
    const timer = setTimeout(() => {
      if (phase >= 6) {
        setPhase(0);
        setCycle((c) => c + 1);
      } else {
        setPhase((p) => p + 1);
      }
    }, timings[phase] || 1000);
    return () => clearTimeout(timer);
  }, [phase, cycle]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative w-full max-w-[640px]"
    >
      {/* Layered glow */}
      <div className="absolute -inset-12 bg-brand-400/[0.10] rounded-full blur-[100px]" />
      <div className="absolute -inset-6 bg-brand-400/[0.06] rounded-full blur-[50px]" />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative glass-strong rounded-2xl p-1.5 border-glow"
      >
        <div className="bg-surface-100 rounded-[14px] p-5">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-accent-emerald animate-pulse" />
              <span className="text-[11px] font-mono text-slate-500">LIVE ANALYSIS</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent-rose/60" />
              <div className="w-2 h-2 rounded-full bg-brand-400/60" />
              <div className="w-2 h-2 rounded-full bg-accent-emerald/60" />
            </div>
          </div>

          {/* Video player mini */}
          <div className="bg-surface-0 rounded-xl h-44 relative overflow-hidden mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-surface-200/40 to-surface-0" />
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="w-12 h-12 rounded-full bg-brand-400/10 border border-brand-400/20 flex items-center justify-center">
                <Play className="w-5 h-5 text-brand-400 fill-brand-400/30 ml-0.5" />
              </div>
            </motion.div>
            <div className="absolute bottom-0 inset-x-0 h-9 bg-surface-200/70 backdrop-blur-sm flex items-center px-3 gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-400" />
              <div className="flex-1 h-0.5 bg-surface-400/40 rounded-full">
                <motion.div
                  animate={{ width: ['20%', '65%', '20%'] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-full bg-brand-400/60 rounded-full"
                />
              </div>
              <span className="text-[9px] font-mono text-slate-600">12:45</span>
            </div>
          </div>

          {/* Animated chat sequence — fixed height, never grows */}
          <div className="h-[200px] relative overflow-hidden">
            <div className="absolute inset-0 flex flex-col gap-2.5">
            <AnimatePresence mode="sync">
              {/* Phase 1+: Typing indicator */}
              {phase === 1 && (
                <motion.div key={`typing-${cycle}`}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="bg-brand-400/[0.06] border border-brand-400/10 rounded-lg rounded-br-sm p-3 ml-10">
                  <div className="flex gap-1 items-center h-4">
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-brand-400/60" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-brand-400/60" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-brand-400/60" />
                  </div>
                </motion.div>
              )}

              {/* Phase 2+: User question */}
              {phase >= 2 && (
                <motion.div key={`q-${cycle}`}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="bg-brand-400/[0.06] border border-brand-400/10 rounded-lg rounded-br-sm p-3 ml-10">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    What did the CTO say about the deployment timeline?
                  </p>
                </motion.div>
              )}

              {/* Phase 3+: AI answer */}
              {phase >= 3 && (
                <motion.div key={`a-${cycle}`}
                  initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="bg-surface-300/50 rounded-lg rounded-bl-sm p-3 mr-8">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3 h-3 text-brand-400" />
                    <span className="text-[9px] font-mono text-brand-400/70">AI BRAIN</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    At <span className="text-brand-400 font-mono">[12:45]</span>, Sarah Chen stated the Q3 deployment aligns with the revised roadmap...
                  </p>
                </motion.div>
              )}

              {/* Phase 4+: Fact-check alert */}
              {phase >= 4 && (
                <motion.div key={`fc-${cycle}`}
                  initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 20 }}
                  className="bg-accent-rose/[0.06] border border-accent-rose/15 rounded-lg p-2.5 mr-12">
                  <p className="text-[9px] font-mono font-semibold text-accent-rose mb-0.5">⚑ FACT-CHECK</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Claimed 95% optimization — sources show ~42%
                  </p>
                </motion.div>
              )}

              {/* Phase 5+: Mood map hint */}
              {phase >= 5 && (
                <motion.div key={`mood-${cycle}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-2 bg-accent-emerald/[0.04] border border-accent-emerald/10 rounded-lg px-3 py-2">
                  <BarChart3 className="w-3 h-3 text-accent-emerald" />
                  <span className="text-[9px] font-mono text-accent-emerald/70">SENTIMENT SPIKE</span>
                  <span className="text-[9px] text-slate-500 ml-auto">Conflict detected at 12:47</span>
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          </div>

          {/* Input bar */}
          <div className="mt-4 h-9 bg-surface-400/25 rounded-lg flex items-center px-3 justify-between">
            <span className="text-[10px] text-slate-600">Ask about this video...</span>
            <ArrowRight className="w-3.5 h-3.5 text-brand-400/50" />
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -8, 0], x: [0, 3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute -left-4 top-10 glass rounded-lg px-3 py-2 flex items-center gap-2"
      >
        <AudioLines className="w-3.5 h-3.5 text-accent-sky" />
        <span className="text-[10px] font-mono text-slate-400">3 speakers</span>
      </motion.div>

      <motion.div
        animate={{ y: [0, 6, 0], x: [0, -4, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -right-2 top-24 glass rounded-lg px-3 py-2 flex items-center gap-2"
      >
        <Eye className="w-3.5 h-3.5 text-accent-violet" />
        <span className="text-[10px] font-mono text-slate-400">720 frames</span>
      </motion.div>

      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="absolute -left-2 bottom-8 glass rounded-lg px-3 py-2 flex items-center gap-2"
      >
        <BarChart3 className="w-3.5 h-3.5 text-accent-emerald" />
        <span className="text-[10px] font-mono text-slate-400">Mood map</span>
      </motion.div>
    </motion.div>
  );
}

/* ── UPLOAD MODAL ── */
function UploadModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await videoApi.upload(file, { title: file.name.replace(/\.[^.]+$/, '') }, (p) => setUploadProgress(p));
      toast.success('Video uploaded — starting analysis');
      const videoId = result.data._id;
      await videoApi.triggerProcessing(videoId);
      onClose();
      navigate(`/processing/${videoId}`);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
      setUploading(false);
    }
  }, [navigate, onClose]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mpeg'] }, maxFiles: 1, disabled: uploading,
  });

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !uploading) onClose(); };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, uploading, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
          <div className="absolute inset-0 bg-surface-0/80 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ duration: 0.25 }}
            className="relative glass-strong rounded-3xl p-8 w-full max-w-lg">
            {!uploading && (<button onClick={onClose} className="absolute top-4 right-4 btn-ghost !p-2 !rounded-lg"><X className="w-4 h-4" /></button>)}
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-surface-300/50 border border-white/[0.04] flex items-center justify-center mx-auto mb-4">
                <Upload className="w-6 h-6 text-brand-400" />
              </div>
              <h2 className="font-display text-2xl text-white mb-1">Upload your video</h2>
              <p className="text-sm text-slate-500">Zeta will transcribe, analyze, and index it for you</p>
            </div>
            <div {...getRootProps()} className={`rounded-2xl p-10 border-2 border-dashed transition-all duration-300 cursor-pointer text-center
              ${isDragActive ? 'border-brand-400/50 bg-brand-400/[0.04]' : 'border-white/[0.06] hover:border-brand-400/30 hover:bg-surface-300/20'}
              ${uploading ? 'pointer-events-none' : ''}`}>
              <input {...getInputProps()} />
              {uploading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full border-2 border-brand-400/30 border-t-brand-400 animate-spin" />
                  <div><p className="text-brand-400 font-semibold mb-1">Uploading... {uploadProgress}%</p><p className="text-xs text-slate-600">Do not close this window</p></div>
                  <div className="w-full max-w-xs h-1.5 bg-surface-400/40 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-brand-400 rounded-full" animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>
              ) : isDragActive ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-brand-400/10 border border-brand-400/20 flex items-center justify-center"><Upload className="w-6 h-6 text-brand-400" /></div>
                  <p className="text-brand-400 font-medium">Drop it here</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-slate-300 font-medium">Click to browse or drag & drop</p>
                  <p className="text-xs text-slate-600">MP4, WebM, MOV, AVI — up to 2GB</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════
   MAIN LANDING PAGE
   ════════════════════════════════════════════════ */
export default function LandingPage() {
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="min-h-screen bg-surface-50 bg-noise">
      {/* NAV */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-400 flex items-center justify-center">
              <Play className="w-4 h-4 text-surface-0 fill-surface-0 ml-0.5" />
            </div>
            <span className="font-display text-xl text-white">Zeta</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how" className="hover:text-white transition-colors">How It Works</a>
            <a href="#stack" className="hover:text-white transition-colors">Stack</a>
          </div>
          <button onClick={() => setShowUpload(true)} className="btn-primary text-sm">
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute top-20 right-1/3 w-[500px] h-[500px] rounded-full bg-brand-400/[0.03] blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-accent-violet/[0.02] blur-[100px]" />

        <div className="relative max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          {/* LEFT — Text */}
          <motion.div className="flex-1 max-w-xl" {...stagger} initial="initial" animate="animate">
            <motion.div {...fadeUp(0)} className="mb-5">
              <span className="badge"><Sparkles className="w-3 h-3 text-brand-400" /> Multimodal Video Intelligence</span>
            </motion.div>
            <motion.h1 {...fadeUp(0.08)} className="font-display text-white mb-6" style={{ fontSize: 'clamp(2.4rem, 4.5vw, 3.8rem)', lineHeight: 1.08, letterSpacing: '-0.02em' }}>
              Turn your videos<br />into <span className="text-gradient">conversational</span><br /><span className="text-gradient">knowledge</span>
            </motion.h1>
            <motion.p {...fadeUp(0.16)} className="text-base text-slate-400 leading-relaxed max-w-md mb-8">
              Upload a recorded meeting, lecture, or webinar. Zeta watches and listens — then lets you query the content with exact timestamps, speaker attribution, and fact-checked answers.
            </motion.p>
            <motion.div {...fadeUp(0.24)} className="flex flex-wrap gap-3">
              <button onClick={() => setShowUpload(true)} className="btn-primary px-6 py-3 text-sm">Index Your First Video <ArrowRight className="w-4 h-4" /></button>
              <a href="#features" className="btn-secondary px-6 py-3 text-sm">Explore Features</a>
            </motion.div>
            <motion.div {...fadeUp(0.32)} className="flex gap-6 mt-10">
              {[{ value: '<6min', label: 'Ingestion time' }, { value: '1536d', label: 'Vector embeddings' }, { value: '99.2%', label: 'Timestamp accuracy' }].map((s) => (
                <div key={s.label}><div className="text-lg font-semibold text-white font-mono">{s.value}</div><div className="text-[11px] text-slate-600">{s.label}</div></div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — Dashboard centered in its half */}
          <div className="flex-1 flex justify-center lg:min-w-[580px]">
            <HeroDashboard />
          </div>
        </div>
      </section>

      {/* ── FEATURES — staggered card reveals ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }} viewport={{ once: false, margin: '-80px' }} className="text-center mb-14">
            <span className="section-label">Core Capabilities</span>
            <h2 className="font-display text-title text-white mt-3">Every feature your video data needs</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Search, title: 'Multimodal RAG Search', desc: 'Query both what was said and what was shown. Dual-stream retrieval across transcripts and visual frames, fused by timestamp.', color: 'text-accent-sky' },
              { icon: Users, title: 'Speaker Identity', desc: 'Pyannote diarization distinguishes every voice. Know exactly who said what, and when — with millisecond precision.', color: 'text-accent-violet' },
              { icon: MessageSquareText, title: 'Virtual Participant', desc: 'Chat with a Digital Twin of any meeting attendee after the recording ends. Scoped RAG ensures they only know what they heard.', color: 'text-brand-400' },
              { icon: ShieldCheck, title: 'Bullshit Detector', desc: 'Every empirical claim is fact-checked against live web data via Tavily. Contradictions are flagged in real-time.', color: 'text-accent-rose' },
              { icon: BarChart3, title: 'Mood Map', desc: 'Sentiment timeline of the entire meeting. Click emotional spikes to jump straight to heated debates or key agreements.', color: 'text-accent-emerald' },
              { icon: FileCode2, title: 'Whiteboard → Code', desc: 'Pause on a messy diagram. One click converts it to clean Mermaid.js — a digital flowchart you can edit and export.', color: 'text-brand-300' },
            ].map((f, i) => (
              <motion.div key={f.title}
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                viewport={{ once: false, margin: '-50px' }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="glass rounded-2xl p-6 hover:bg-surface-200/50 transition-colors group cursor-default">
                <f.icon className={`w-5 h-5 ${f.color} mb-4`} />
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PIPELINE — alternating slide-in ── */}
      <section id="how" className="py-24 px-6 bg-surface-0/50">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }} viewport={{ once: false, margin: '-80px' }} className="text-center mb-14">
            <span className="section-label">Pipeline</span>
            <h2 className="font-display text-title text-white mt-3">From upload to insight in minutes</h2>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', label: 'Upload', desc: 'Drop any video — MP4, WebM, MOV, AVI. Auto-converted to MP4.', icon: Upload },
              { step: '02', label: 'Ingest', desc: 'Audio transcribed & diarized. Frames analyzed by VLM. Everything embedded.', icon: Zap },
              { step: '03', label: 'Index', desc: 'Vectors stored in ChromaDB. Metadata in MongoDB. Full temporal linkage.', icon: Database },
              { step: '04', label: 'Query', desc: 'Ask anything. Get answers with timestamps, sources, and fact-checks.', icon: MessageSquareText },
            ].map((s, i) => (
              <motion.div key={s.step}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                viewport={{ once: false, margin: '-40px' }}
                className="relative text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.15 + 0.2, type: 'spring', stiffness: 200 }}
                  viewport={{ once: false }}
                  className="w-14 h-14 rounded-xl bg-surface-200 border border-white/[0.04] flex items-center justify-center mx-auto mb-4">
                  <s.icon className="w-5 h-5 text-brand-400" />
                </motion.div>
                <span className="text-[10px] font-mono text-brand-400/60 block mb-1">{s.step}</span>
                <h4 className="text-white font-semibold mb-1.5">{s.label}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                {i < 3 && <ChevronRight className="hidden md:block absolute top-7 -right-3 w-4 h-4 text-slate-700" />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK — staggered badges ── */}
      <section id="stack" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }} viewport={{ once: false, margin: '-80px' }} className="text-center mb-10">
            <span className="section-label">Built With</span>
            <h2 className="font-display text-title text-white mt-3">Production-grade stack</h2>
          </motion.div>
          <div className="flex flex-wrap justify-center gap-3">
            {['React', 'Node.js', 'MongoDB', 'ChromaDB', 'OpenAI Whisper', 'Ollama', 'Pyannote', 'BLIP-2', 'LangChain', 'Tavily', 'Socket.IO', 'FFmpeg'].map((t, i) => (
              <motion.span key={t}
                initial={{ opacity: 0, scale: 0.7, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, type: 'spring', stiffness: 250 }}
                viewport={{ once: false }}
                whileHover={{ scale: 1.08, transition: { duration: 0.15 } }}
                className="badge text-sm px-4 py-2 cursor-default">
                {t}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-16 px-6 bg-surface-0/50">
        <motion.div initial={{ opacity: 0, scale: 0.92, y: 30 }} whileInView={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }} viewport={{ once: false, margin: '-60px' }}
          className="max-w-3xl mx-auto glass-strong rounded-3xl p-10 border-glow text-center">
          <h2 className="font-display text-2xl text-white mb-3">Ready to unlock your video data?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Every recorded meeting, lecture, and webinar becomes an interactive knowledge base. Start in under a minute.
          </p>
          <button onClick={() => setShowUpload(true)} className="btn-primary px-8 py-3 text-base">
            Index Your First Video <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 px-6 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-brand-400/80 flex items-center justify-center">
              <Play className="w-2.5 h-2.5 text-surface-0 fill-surface-0 ml-px" />
            </div>
            <span>Zeta Video-RAG</span>
          </div>
          <span>Built for research & enterprise knowledge extraction</span>
        </div>
      </footer>

      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}