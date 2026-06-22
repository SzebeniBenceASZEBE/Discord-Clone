import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { useSocket } from '../socket/SocketContext.tsx';
import { theme } from '../theme.ts';
import { Avatar } from './Avatar.tsx';
import { VoiceSettingsModal } from '../voice/VoiceSettingsModal.tsx';

function IconButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} style={{ background: 'none', border: 'none', color: active ? '#f23f43' : theme.textMuted, cursor: 'pointer', padding: 6, display: 'flex', borderRadius: 4 }}>
      {children}
    </button>
  );
}

const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg {...svgProps}>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="22" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function HeadphonesIcon({ off }: { off: boolean }) {
  return (
    <svg {...svgProps}>
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

/**
 * Bottom-left panel (Discord-style): your avatar + status dot + display name,
 * and mic/deafen/settings controls. The controls are visual placeholders until
 * the voice and settings phases — they toggle their own look but do nothing yet.
 */
export function UserPanel() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (!user) return null;

  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: theme.rail }}>
      <Avatar name={user.displayName} id={user.id} size={32} status={connected ? 'online' : 'offline'} ringColor={theme.rail} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
        <div style={{ fontSize: 11, color: theme.textMuted }}>{connected ? 'Online' : 'Connecting…'}</div>
      </div>
      <IconButton title={muted ? 'Unmute' : 'Mute'} active={muted} onClick={() => setMuted((m) => !m)}><MicIcon off={muted} /></IconButton>
      <IconButton title={deafened ? 'Undeafen' : 'Deafen'} active={deafened} onClick={() => setDeafened((d) => !d)}><HeadphonesIcon off={deafened} /></IconButton>
      <IconButton title="Voice settings" onClick={() => setShowSettings(true)}><GearIcon /></IconButton>
      {showSettings && <VoiceSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
