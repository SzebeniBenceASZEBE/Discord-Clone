import type { Channel, Community } from '@dc/shared';
import { theme, layout } from '../theme.ts';
import { UserPanel } from '../components/UserPanel.tsx';
import { VoicePanel } from '../voice/VoicePanel.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { useVoice } from '../voice/VoiceContext.tsx';
import type { VoiceMember } from '../voice/VoiceContext.tsx';

function StreamIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Sharing screen">
      <rect x="3" y="4" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MutedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Muted">
      <path d="M12 3a3 3 0 013 3v5a3 3 0 01-5.2 2M9 6a3 3 0 013-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 11a7 7 0 0010 6M19 11a7 7 0 01-1 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function DeafenedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Deafened">
      <path d="M4 14v-2a8 8 0 0116 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 14a2 2 0 012-2h1v6H6a2 2 0 01-2-2v-2ZM20 14a2 2 0 00-2-2h-1v6h1a2 2 0 002-2v-2Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A connected voice participant, shown indented under the voice channel. */
function VoiceParticipantRow({ member }: { member: VoiceMember }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 8px 3px 24px' }}>
      <div style={{ borderRadius: '50%', outline: member.speaking ? `2px solid ${theme.green}` : '2px solid transparent' }}>
        <Avatar name={member.name} id={member.identity} size={20} />
      </div>
      <span style={{ flex: 1, fontSize: 13, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
      {member.streaming && <span style={{ color: theme.green, display: 'flex' }}><StreamIcon /></span>}
      {member.deafened ? (
        <span style={{ color: '#f23f43', display: 'flex' }}><DeafenedIcon /></span>
      ) : (
        member.muted && <span style={{ color: '#f23f43', display: 'flex' }}><MutedIcon /></span>
      )}
    </div>
  );
}

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
  const voice = useVoice();
  const textChannels = channels.filter((c) => c.kind === 'text');
  const voiceChannels = channels.filter((c) => c.kind === 'voice');

  function row(c: Channel) {
    const selected = c.id === selectedChannelId;
    return (
      <div
        onClick={() => onSelectChannel(c.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          color: selected ? theme.text : theme.textMuted,
          background: selected ? theme.hover : 'transparent',
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
        {textChannels.map((c) => row(c))}
        <div style={{ padding: '12px 8px 4px', color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Voice</div>
        {voiceChannels.map((c) => (
          <div key={c.id}>
            {row(c)}
            {/* Who's connected to this voice channel, with live status icons. */}
            {voice.channelId === c.id && voice.members.map((m) => <VoiceParticipantRow key={m.identity} member={m} />)}
          </div>
        ))}
      </div>
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}
