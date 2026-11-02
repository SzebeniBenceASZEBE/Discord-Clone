import type { DmSummary, FriendRequest, PresenceStatus, UserSummary } from '@dc/shared';
import { theme, layout } from '../theme.ts';
import { Avatar } from './Avatar.tsx';
import { UserPanel } from './UserPanel.tsx';
import { VoicePanel } from '../voice/VoicePanel.tsx';

const sectionLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 8px 4px',
  color: theme.textMuted,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
};

function PersonRow({ id, name, status, selected, onClick }: { id: string; name: string; status: PresenceStatus; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: selected ? theme.hover : 'transparent' }}>
      <Avatar name={name} id={id} size={32} status={status} ringColor={theme.sidebar} />
      <span style={{ color: selected ? theme.text : theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
}

/** A circular icon button used for accept (✓) / decline (✕) actions. */
function IconButton({ title, color, onClick, children }: { title: string; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', border: 'none', background: theme.chatBg, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </button>
  );
}

function RequestRow({ req, onAccept, onDecline, onCancel }: { req: FriendRequest; onAccept: (id: string) => void; onDecline: (id: string) => void; onCancel: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4 }}>
      <Avatar name={req.user.displayName} id={req.user.id} size={32} status={req.user.status} ringColor={theme.sidebar} />
      <span style={{ flex: 1, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.user.displayName}</span>
      {req.direction === 'incoming' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <IconButton title="Accept" color={theme.green} onClick={() => onAccept(req.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </IconButton>
          <IconButton title="Decline" color={theme.red} onClick={() => onDecline(req.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </IconButton>
        </div>
      ) : (
        <IconButton title="Cancel request" color={theme.textMuted} onClick={() => onCancel(req.id)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </IconButton>
      )}
    </div>
  );
}

/** Home-view second column: DMs, friend requests, and your friends list. */
export function DmSidebar({
  dms,
  friends,
  incoming,
  outgoing,
  selectedConversationId,
  onSelectDm,
  onStartDm,
  onAddFriend,
  onAccept,
  onDecline,
  onCancel,
}: {
  dms: DmSummary[];
  friends: UserSummary[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  selectedConversationId: string | null;
  onSelectDm: (dm: DmSummary) => void;
  onStartDm: (user: UserSummary) => void;
  onAddFriend: () => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  // Friends you don't already have a DM open with — tap to start one.
  const inDm = new Set(dms.map((d) => d.otherUser.id));
  const friendsNotInDm = friends.filter((f) => !inDm.has(f.id));
  const nothing = dms.length === 0 && friends.length === 0 && incoming.length === 0 && outgoing.length === 0;

  return (
    <aside style={{ width: layout.sidebarWidth, flex: 'none', background: theme.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: layout.topBarHeight, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontWeight: 600, boxShadow: '0 1px 0 rgba(0,0,0,.2)' }}>
        <span>Direct Messages</span>
        <button
          title="Add friend"
          onClick={onAddFriend}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: theme.green, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          Add
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollthin">
        {dms.map((dm) => (
          <PersonRow key={dm.conversationId} id={dm.otherUser.id} name={dm.otherUser.displayName} status={dm.otherUser.status} selected={dm.conversationId === selectedConversationId} onClick={() => onSelectDm(dm)} />
        ))}

        {incoming.length > 0 && <div style={sectionLabel}>Friend Requests — {incoming.length}</div>}
        {incoming.map((r) => (
          <RequestRow key={r.id} req={r} onAccept={onAccept} onDecline={onDecline} onCancel={onCancel} />
        ))}

        {friendsNotInDm.length > 0 && <div style={sectionLabel}>Friends</div>}
        {friendsNotInDm.map((f) => (
          <PersonRow key={f.id} id={f.id} name={f.displayName} status={f.status} selected={false} onClick={() => onStartDm(f)} />
        ))}

        {outgoing.length > 0 && <div style={sectionLabel}>Pending — {outgoing.length}</div>}
        {outgoing.map((r) => (
          <RequestRow key={r.id} req={r} onAccept={onAccept} onDecline={onDecline} onCancel={onCancel} />
        ))}

        {nothing && (
          <div style={{ color: theme.textMuted, fontSize: 13, padding: 8, lineHeight: 1.5 }}>
            No friends yet. Hit <strong style={{ color: theme.text }}>＋ Add</strong> above and enter a username to send a friend request.
          </div>
        )}
      </div>
      <VoicePanel />
      <UserPanel />
    </aside>
  );
}
