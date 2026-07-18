import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { sentimentApi } from '@services/api';
import useAppStore from '@context/store';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const mins = Math.floor(d.timestamp / 60);
  const secs = Math.floor(d.timestamp % 60);

  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-[11px] border border-white/[0.06] shadow-card">
      <div className="font-mono text-brand-400 mb-1">{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}</div>
      <div className="text-slate-300">Score: <span className="font-semibold text-white">{Math.round(d.compositeScore)}</span>/100</div>
      <div className="text-slate-400 capitalize">{d.dominantEmotion || d.moodCategory}</div>
      {d.speakerId && <div className="text-slate-500 font-mono text-[9px] mt-0.5">{d.speakerId}</div>}
      {d.isSpike && d.spikeDescription && (
        <div className="text-accent-rose text-[10px] mt-1 border-t border-white/[0.04] pt-1">{d.spikeDescription}</div>
      )}
    </div>
  );
}

export default function MoodMap({ videoId }) {
  const { sentimentTimeline, setSentimentTimeline, setVideoPlayerTime } = useAppStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!videoId) return;
    const load = async () => {
      setLoading(true);
      try {
        const result = await sentimentApi.getTimeline(videoId);
        setSentimentTimeline(result.data || []);
      } catch (e) {
        console.error('Failed to load sentiment:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [videoId]);

  // Split data into agreement/conflict lines
  const chartData = sentimentTimeline.map((d) => ({
    ...d,
    time: Math.round(d.timestamp / 60 * 10) / 10, // minutes
    agreement: d.moodCategory === 'agreement' || d.moodCategory === 'neutral' ? d.compositeScore : null,
    conflict: d.moodCategory === 'conflict' ? d.compositeScore : null,
    score: d.compositeScore,
  }));

  const spikes = sentimentTimeline.filter((d) => d.isSpike);

  const handleClick = (data) => {
    if (data?.timestamp) {
      setVideoPlayerTime(data.timestamp);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs font-mono text-slate-600">Loading mood map...</span>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <BarChart3 className="w-6 h-6 text-slate-700 mb-2" />
        <p className="text-xs text-slate-600">Mood map data will appear after processing</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent-emerald" />
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Multimodal Mood Map</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-emerald" />
            <span className="text-slate-500">Agreement</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-rose" />
            <span className="text-slate-500">Conflict</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} onClick={(e) => e?.activePayload?.[0] && handleClick(e.activePayload[0].payload)}>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: '#475569', fontFamily: 'monospace' }}
              tickFormatter={(v) => `${Math.round(v)}m`}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: '#475569', fontFamily: 'monospace' }}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Agreement line (green) */}
            <Line
              type="monotone"
              dataKey="score"
              stroke="#34d399"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: '#34d399', stroke: '#0f1218', strokeWidth: 2 }}
            />

            {/* Spike markers */}
            {spikes.map((spike, i) => (
              <ReferenceDot
                key={i}
                x={Math.round(spike.timestamp / 60 * 10) / 10}
                y={spike.compositeScore}
                r={5}
                fill={spike.spikeType === 'conflict' ? '#fb7185' : '#34d399'}
                stroke="#0f1218"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Spike markers row */}
      {spikes.length > 0 && (
        <div className="px-4 py-2 border-t border-white/[0.04] flex gap-2 overflow-x-auto">
          {spikes.slice(0, 6).map((spike, i) => {
            const mins = Math.floor(spike.timestamp / 60);
            const secs = Math.floor(spike.timestamp % 60);
            const isConflict = spike.spikeType === 'conflict';

            return (
              <button
                key={i}
                onClick={() => setVideoPlayerTime(spike.timestamp)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors ${
                  isConflict
                    ? 'bg-accent-rose/[0.06] border border-accent-rose/15 text-accent-rose hover:bg-accent-rose/10'
                    : 'bg-accent-emerald/[0.06] border border-accent-emerald/15 text-accent-emerald hover:bg-accent-emerald/10'
                }`}
              >
                {isConflict ? <TrendingDown className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
                {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
