import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, PanelLeftClose, PanelLeft, FileText, MessageSquareText, Info } from 'lucide-react';
import toast from 'react-hot-toast';

import VideoPlayer from '@components/Dashboard/VideoPlayer';
import ChatPanel from '@components/Dashboard/ChatPanel';
import MoodMap from '@components/Dashboard/MoodMap';
import TranscriptPanel from '@components/Dashboard/TranscriptPanel';
import InfoBar from '@components/Dashboard/InfoBar';
import FactCheckModal from '@components/Dashboard/FactCheckModal';
import DigitalizeModal from '@components/Dashboard/DigitalizeModal';

import { videoApi, agentApi } from '@services/api';
import { initSocket, joinVideoRoom, onProcessingProgress } from '@services/socket';
import useAppStore from '@context/store';

const TABS = [
  { key: 'chat', label: 'Chat', icon: MessageSquareText },
  { key: 'transcript', label: 'Transcript', icon: FileText },
  { key: 'info', label: 'Info', icon: Info },
];

export default function DashboardPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { currentVideo, setCurrentVideo, activePanel, setActivePanel, sidebarCollapsed, toggleSidebar } = useAppStore();
  const [loading, setLoading] = useState(true);

  // Fact-check modal state
  const [factCheckOpen, setFactCheckOpen] = useState(false);

  // Digitalize modal state
  const [digitalizeOpen, setDigitalizeOpen] = useState(false);

  // Load video data
  useEffect(() => {
    if (!videoId) return;
    const load = async () => {
      try {
        const result = await videoApi.get(videoId);
        if (result.data.status !== 'completed') {
          navigate(`/processing/${videoId}`);
          return;
        }
        setCurrentVideo(result.data);
      } catch (e) {
        toast.error('Failed to load video');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    load();

    initSocket();
    joinVideoRoom(videoId);

    const unsub = onProcessingProgress((data) => {
      if (data.videoId === videoId && data.pipeline === 'factCheck' && data.stage === 'completed') {
        videoApi.get(videoId).then((r) => setCurrentVideo(r.data));
      }
    });

    return () => unsub();
  }, [videoId]);

  const handleRunFactCheck = () => {
    setFactCheckOpen(true);
  };

  const handleDigitalizeAll = () => {
    setDigitalizeOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-brand-400/30 border-t-brand-400 animate-spin mx-auto mb-3" />
          <span className="text-sm text-slate-500 font-mono">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const videoUrl = currentVideo?.filePath
    ? `/uploads/videos/${currentVideo.filePath.replace(/\\/g, '/').split('/').pop()}`
    : null;

  const speakers = currentVideo?.speakerProfiles || [];

  return (
    <div className="h-screen bg-surface-50 bg-noise flex flex-col overflow-hidden">
      {/* TOP NAV */}
      <header className="h-11 flex-shrink-0 glass border-b border-white/[0.04] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/')}>
            <div className="w-6 h-6 rounded-md bg-brand-400 flex items-center justify-center">
              <Play className="w-3 h-3 text-surface-0 fill-surface-0 ml-px" />
            </div>
            <span className="font-display text-base text-white">Zeta</span>
          </div>
          <div className="w-px h-5 bg-white/[0.06]" />
          <span className="text-xs text-slate-500 truncate max-w-[200px]">{currentVideo?.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`badge ${currentVideo?.status === 'completed' ? 'badge-active' : ''} text-[9px]`}>
            {currentVideo?.status?.toUpperCase() || 'UNKNOWN'}
          </span>
        </div>
      </header>

      {/* MAIN LAYOUT: fixed proportions to guarantee both video + mood map fit on one screen */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* LEFT PANEL — Video (70% height) + Mood Map (30% height) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-white/[0.04]">
          {/* Video player — 70% of left column */}
          <div className="flex-[7] min-h-0 bg-surface-100 overflow-hidden">
            <VideoPlayer videoUrl={videoUrl} />
          </div>

          {/* Mood Map — 30% of left column, always visible, no scroll */}
          <div className="flex-[3] min-h-0 bg-surface-100 border-t border-white/[0.04] overflow-hidden">
            <MoodMap videoId={videoId} />
          </div>
        </div>

        {/* RIGHT PANEL — Tabbed (Chat / Transcript / Info) */}
        <div className={`flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-12' : 'w-[400px]'} flex-shrink-0 bg-surface-100 min-h-0`}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center py-3 gap-2">
              <button onClick={toggleSidebar} className="btn-ghost !p-2 !rounded-lg mb-2">
                <PanelLeft className="w-4 h-4" />
              </button>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActivePanel(tab.key); if (sidebarCollapsed) toggleSidebar(); }}
                  className={`btn-ghost !p-2 !rounded-lg ${activePanel === tab.key ? 'text-brand-400' : ''}`}
                  title={tab.label}
                >
                  <tab.icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center border-b border-white/[0.04] px-2 flex-shrink-0">
                <button onClick={toggleSidebar} className="btn-ghost !p-2 !rounded-lg mr-1">
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActivePanel(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-colors border-b-2 -mb-px ${
                      activePanel === tab.key
                        ? 'text-brand-400 border-brand-400'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {activePanel === 'chat' && (
                  <ChatPanel videoId={videoId} speakers={speakers} />
                )}
                {activePanel === 'transcript' && (
                  <TranscriptPanel videoId={videoId} />
                )}
                {activePanel === 'info' && (
                  <InfoBar
                    video={currentVideo}
                    onRunFactCheck={handleRunFactCheck}
                    onDigitalizeAll={handleDigitalizeAll}
                    factCheckLoading={false}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODALS */}
      {factCheckOpen && (
        <FactCheckModal
          videoId={videoId}
          onClose={() => {
            setFactCheckOpen(false);
            videoApi.get(videoId).then((r) => setCurrentVideo(r.data));
          }}
        />
      )}
      {digitalizeOpen && (
        <DigitalizeModal
          videoId={videoId}
          onClose={() => setDigitalizeOpen(false)}
        />
      )}
    </div>
  );
}