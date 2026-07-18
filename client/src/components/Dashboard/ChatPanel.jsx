import React, { useState, useRef, useEffect } from 'react';
import { Brain, Send, ChevronDown, Loader2, AlertTriangle, Clock, User, Bot, Zap, X } from 'lucide-react';
import useChat from '@hooks/useChat';
import useAppStore from '@context/store';

function formatTs(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function TimestampLink({ time, label }) {
  const { setVideoPlayerTime } = useAppStore();
  return (
    <button
      onClick={() => setVideoPlayerTime(time)}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-400/10 text-brand-400 text-[11px] font-mono hover:bg-brand-400/20 transition-colors"
    >
      <Clock className="w-2.5 h-2.5" />
      {label || `[${formatTs(time)}]`}
    </button>
  );
}

function FactCheckBanner({ alert }) {
  if (!alert?.triggered) return null;
  return (
    <div className="mt-2 bg-accent-rose/[0.06] border border-accent-rose/15 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertTriangle className="w-3 h-3 text-accent-rose" />
        <span className="text-[10px] font-mono font-bold text-accent-rose uppercase">Fact-Check</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{alert.explanation || alert.evidence}</p>
      {alert.correctedValue && (
        <p className="text-xs text-accent-rose mt-1 font-medium">Corrected: {alert.correctedValue}</p>
      )}
      {alert.sourceUrl && (
        <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-accent-sky hover:underline mt-1 inline-block">Source</a>
      )}
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';

  // Parse timestamps from text like [12:45]
  const renderContent = (text) => {
    if (!text) return null;
    const parts = text.split(/(\[\d{1,2}:\d{2}\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d{1,2}):(\d{2})\]$/);
      if (match) {
        const time = parseInt(match[1]) * 60 + parseInt(match[2]);
        return <TimestampLink key={i} time={time} label={part} />;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
        isUser ? 'bg-brand-400/10' : msg.isError ? 'bg-accent-rose/10' : 'bg-surface-300/60'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 text-brand-400" /> : <Bot className="w-3.5 h-3.5 text-slate-400" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {msg.persona && (
          <span className="text-[9px] font-mono text-accent-violet block mb-0.5">
            {msg.persona.label || msg.persona.speakerId} ({msg.persona.role || 'Participant'})
          </span>
        )}
        <div className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? 'bg-brand-400/[0.08] border border-brand-400/10 text-slate-300'
            : msg.isError
              ? 'bg-accent-rose/[0.06] border border-accent-rose/10 text-slate-400'
              : 'bg-surface-300/40 text-slate-300'
        }`}>
          {renderContent(msg.content)}
        </div>
        <FactCheckBanner alert={msg.factCheckAlert} />
        {msg.referencedTimestamps?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {msg.referencedTimestamps.map((ts, i) => (
              <TimestampLink key={i} time={ts.time} label={ts.label} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel({ videoId, speakers = [] }) {
  const { messages, isLoading, sendMessage, clearChat, activeSpeakerId } = useChat(videoId);
  const { llmProvider, setLlmProvider, setActiveSpeakerId } = useAppStore();
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-white">AI Analysis Brain</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="btn-ghost !p-1.5 !rounded-lg">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Settings row */}
        {showSettings && (
          <div className="space-y-2 pt-2 border-t border-white/[0.04]">
            {/* LLM Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">LLM Provider</span>
              <div className="flex gap-1 bg-surface-400/30 rounded-lg p-0.5">
                {[
                  { key: 'openai', label: 'GPT-4o', icon: '◆' },
                  { key: 'llama', label: 'Llama 3', icon: '◇' },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setLlmProvider(p.key)}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono font-medium transition-all ${
                      llmProvider === p.key
                        ? 'bg-brand-400/15 text-brand-400 border border-brand-400/20'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Virtual Participant Dropdown */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Chat Mode</span>
              <select
                value={activeSpeakerId || ''}
                onChange={(e) => {
                  setActiveSpeakerId(e.target.value || null);
                  clearChat();
                }}
                className="bg-surface-400/30 border border-white/[0.04] rounded-lg px-2.5 py-1 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-brand-400/30 appearance-none cursor-pointer min-w-[140px]"
              >
                <option value="">General AI Chat</option>
                {speakers.map((s) => (
                  <option key={s.speakerId} value={s.speakerId}>
                    🗣 {s.label || s.speakerId}{s.role ? ` (${s.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Active persona indicator */}
        {activeSpeakerId && (
          <div className="flex items-center gap-2 mt-2 bg-accent-violet/[0.06] border border-accent-violet/15 rounded-lg px-3 py-1.5">
            <span className="text-[10px] font-mono text-accent-violet">
              Chatting with: {speakers.find((s) => s.speakerId === activeSpeakerId)?.label || activeSpeakerId}
            </span>
            <button onClick={() => { setActiveSpeakerId(null); clearChat(); }} className="ml-auto">
              <X className="w-3 h-3 text-slate-500 hover:text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain className="w-8 h-8 text-slate-700 mb-3" />
            <p className="text-sm text-slate-500 mb-1">
              {activeSpeakerId ? 'Ask the virtual participant anything' : 'Ask anything about this video'}
            </p>
            <p className="text-[11px] text-slate-600">
              {activeSpeakerId
                ? 'They will answer using only what they heard or said'
                : 'Try: "What was discussed at the 15 minute mark?"'}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono">
              {activeSpeakerId ? 'Persona thinking...' : 'Analyzing video context...'}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.04]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeSpeakerId ? `Ask ${speakers.find((s) => s.speakerId === activeSpeakerId)?.label || 'participant'}...` : 'Type a message...'}
            disabled={isLoading}
            className="input-field !py-2.5 !text-sm"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="btn-primary !px-3 !py-2.5 !rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] font-mono text-slate-700">
            {llmProvider === 'openai' ? '◆ GPT-4o' : '◇ Llama 3'} · {activeSpeakerId ? 'Scoped RAG' : 'Full context'}
          </span>
          <button onClick={clearChat} className="text-[9px] text-slate-700 hover:text-slate-400 transition-colors">
            Clear chat
          </button>
        </div>
      </div>
    </div>
  );
}
