import { useEffect, useState } from 'react';
import { theme } from '../theme.ts';
import { useVoice } from './VoiceContext.tsx';
import { VoiceSettingsModal } from './VoiceSettingsModal.tsx';

function fmt(sinceMs: number): string {
  const s = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function SignalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  );
}
function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg {...svg}>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      {off && <line x1="2" y1="2" x2="22" y2="22" />}
    </svg>
  );
}
function ScreenIcon() {
  return (
    <svg {...svg}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M12 7v5M9.5 9.5 12 7l2.5 2.5" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}
function PhoneOffIcon() {
  return (
    <svg {...svg}>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.29.62 2 2 0 0 1 1.72 2v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34A19.79 19.79 0 0 1 3.07 4.18 2 2 0 0 1 5 2h2a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.92 9.92" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function CtrlButton({ title, onClick, active, danger, children }: { title: string; onClick: () => void; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  const bg = danger ? '#f23f43' : active ? theme.green : theme.sidebar;
  const color = danger || active ? '#fff' : theme.textMuted;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, border: `1px solid ${theme.divider}`, color, borderRadius: 6, padding: '7px 0', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

/**
 * The "Voice Connected" strip pinned above the user panel. Visible whenever
 * you're in a call, on every screen — so you always see you're connected and
 * can leave/toggle camera & screen no matter what view is open.
 */
export function VoicePanel() {
  const voice = useVoice();
  const [, tick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

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
          <div style={{ color: theme.green, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            <SignalIcon />
            Voice Connected
          </div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {voice.channelName}
            {voice.joinedAt ? ` · ${fmt(voice.joinedAt)}` : ''}
          </div>
        </div>
        <button onClick={() => voice.leave()} title="Disconnect" aria-label="Disconnect" style={{ flex: 'none', display: 'flex', background: 'none', border: 'none', color: '#f23f43', cursor: 'pointer', padding: 4 }}>
          <PhoneOffIcon />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <CtrlButton title={voice.cameraOn ? 'Turn off camera' : 'Turn on camera'} active={voice.cameraOn} onClick={() => voice.toggleCamera()}>
          <CameraIcon off={!voice.cameraOn} />
        </CtrlButton>
        <CtrlButton title={voice.screenSharing ? 'Stop sharing your screen' : 'Share your screen'} active={voice.screenSharing} onClick={() => voice.toggleScreen()}>
          <ScreenIcon />
        </CtrlButton>
        <CtrlButton title="Voice settings" onClick={() => setShowSettings(true)}>
          <GearIcon />
        </CtrlButton>
      </div>

      {showSettings && <VoiceSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
