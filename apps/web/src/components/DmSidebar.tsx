import type { DmSummary, PresenceStatus, UserSummary } from '@dc/shared';
import { theme, layout } from '../theme.ts';
import { Avatar } from './Avatar.tsx';
import { UserPanel } from './UserPanel.tsx';

function PersonRow({ id, name, status, selected, onClick }: { id: string; name: string; status: PresenceStatus; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: selected ? theme.hover : 'transparent' }}>
      <Avatar name={name} id={id} size={32} status={status} ringColor={theme.sidebar} />
      <span style={{ color: selected ? theme.text : theme.textMuted }}>{name}</span>
    </div>
  );
}

/** Home-view second column: existing DMs, plus everyone else to start one with. */
export function DmSidebar({
  dms,
  users,
  selectedConversationId,
  onSelectDm,
  onStartDm,
}: {
  dms: DmSummary[];
  users: UserSummary[];
  selectedConversationId: string | null;
  onSelectDm: (dm: DmSummary) => void;
  onStartDm: (user: UserSummary) => void;
}) {
  const inDm = new Set(dms.map((d) => d.otherUser.id));
  const people = users.filter((u) => !inDm.has(u.id));

  return (
    <aside style={{ width: layout.sidebarWidth, flex: 'none', background: theme.sidebar, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: layout.topBarHeight, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: 600, boxShadow: '0 1px 0 rgba(0,0,0,.2)' }}>
        Direct Messages
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollthin">
        {dms.map((dm) => (
          <PersonRow key={dm.conversationId} id={dm.otherUser.id} name={dm.otherUser.displayName} status={dm.otherUser.status} selected={dm.conversationId === selectedConversationId} onClick={() => onSelectDm(dm)} />
        ))}

        {people.length > 0 && (
          <div style={{ padding: '12px 8px 4px', color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>People</div>
        )}
        {people.map((u) => (
          <PersonRow key={u.id} id={u.id} name={u.displayName} status={u.status} selected={false} onClick={() => onStartDm(u)} />
        ))}

        {dms.length === 0 && people.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13, padding: 8 }}>No one else has an account yet. Invite a friend!</div>
        )}
      </div>
      <UserPanel />
    </aside>
  );
}
