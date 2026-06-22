import type { Channel, Community } from '@dc/shared';
import { theme, layout } from '../theme.ts';
import { UserPanel } from '../components/UserPanel.tsx';
import { VoicePanel } from '../voice/VoicePanel.tsx';

/** The second column when a server is open: its channels, grouped by kind. */
export function ChannelList({
  community,
  channels,
  selectedChannelId,
  onSelectChannel,
  onInvite,
}: {
  community: Community;
  channels: Channel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onInvite: () => void;
}) {
  const text = channels.filter((c) => c.kind === 'text');
  const voice = channels.filter((c) => c.kind === 'voice');

  function row(c: Channel, interactive: boolean) {
    const selected = c.id === selectedChannelId;
    return (
      <div
        key={c.id}
        onClick={interactive ? () => onSelectChannel(c.id) : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: interactive ? 'pointer' : 'default',
          color: selected ? theme.text : theme.textMuted,
          background: selected ? theme.hover : 'transparent',
          opacity: interactive ? 1 : 0.6,
        }}
      >
        <span style={{ color: theme.textMuted }}>{c.kind === 'voice' ? '🔊' : '#'}</span>
        {c.name}
      </div>
    );
  }

  return (
    <aside style={{ width: layout.sidebarWidth, flex: 'none', background: theme.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: layout.topBarHeight, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontWeight: 600, boxShadow: '0 1px 0 rgba(0,0,0,.2)' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{community.name}</span>
        <button onClick={onInvite} title="Invite people to this server" style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.textMuted, borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>
          Invite
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollthin">
        <div style={{ padding: '4px 8px', color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Text</div>
        {text.map((c) => row(c, true))}
        <div style={{ padding: '12px 8px 4px', color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Voice</div>
        {voice.map((c) => row(c, true))}
      </div>
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}
