import { useEffect, useState } from 'react';
import { theme } from '../theme.ts';
import { useVoice } from './VoiceContext.tsx';

function fmt(sinceMs: number): string {
  const s = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * The "Voice Connected" strip pinned above the user panel. Visible whenever
 * you're in a call, on every screen — disconnect/mute live here so you control
 * the call no matter what you're looking at.
 */
export function VoicePanel() {
  const voice = useVoice();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!voice.channelId) return;
    const i = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [voice.channelId]);

  if (!voice.channelId) return null;

  return (
    <div style={{ flex: 'none', background: theme.rail, padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.green, fontWeight: 600, fontSize: 13 }}>● Voice Connected</div>
          <div style={{ color: theme.textMuted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {voice.channelName}
            {voice.joinedAt ? ` · ${fmt(voice.joinedAt)}` : ''}
          </div>
        </div>
        <button onClick={() => voice.leave()} title="Disconnect" aria-label="Disconnect" style={{ flex: 'none', background: 'none', border: 'none', color: '#f23f43', cursor: 'pointer', padding: 4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.29.62 2 2 0 0 1 1.72 2v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34A19.79 19.79 0 0 1 3.07 4.18 2 2 0 0 1 5 2h2a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.92 9.92" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => voice.toggleMute()} style={{ flex: 1, background: voice.muted ? '#f23f43' : theme.sidebar, border: `1px solid ${theme.divider}`, color: '#fff', borderRadius: 4, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}>
          {voice.muted ? 'Unmute' : 'Mute'}
        </button>
        <button onClick={() => voice.toggleScreen()} title="Share your screen" style={{ flex: 1, background: voice.screenSharing ? theme.green : theme.sidebar, border: `1px solid ${theme.divider}`, color: '#fff', borderRadius: 4, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}>
          {voice.screenSharing ? 'Stop' : 'Screen'}
        </button>
      </div>
    </div>
  );
}
