import { useEffect, useState } from 'react';
import type { CommunityMember, FriendRelation } from '@dc/shared';
import { theme } from '../theme.ts';
import { api } from '../api.ts';
import { Avatar } from './Avatar.tsx';

const sectionLabel: React.CSSProperties = {
  padding: '4px 8px',
  color: theme.textMuted,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
};

/** The add-friend / status control shown at the right of a member row. */
function MemberAction({ relation, onAdd }: { relation: FriendRelation; onAdd: () => void }) {
  if (relation === 'self' || relation === 'friend') return null;
  if (relation === 'outgoing') return <span style={{ color: theme.textMuted, fontSize: 11 }}>Pending</span>;
  // 'none' → send a request. 'incoming' → sending back auto-accepts (so it
  // effectively means "accept"); the server handles that.
  return (
    <button
      title={relation === 'incoming' ? 'Accept friend request' : 'Add friend'}
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', border: 'none', background: theme.chatBg, color: relation === 'incoming' ? theme.green : theme.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M9 11a4 4 0 100-8 4 4 0 000 8ZM3 20c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18 8v6M21 11h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function MemberRow({ member, relation, onAdd }: { member: CommunityMember; relation: FriendRelation; onAdd: () => void }) {
  const offline = member.status === 'offline';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 4, opacity: offline ? 0.45 : 1 }}>
      <Avatar name={member.displayName} id={member.id} size={32} status={member.status} ringColor={theme.panel} />
      <span style={{ flex: 1, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {member.displayName}
        {member.role === 'owner' && (
          <span title="Server owner" style={{ marginLeft: 6 }}>
            👑
          </span>
        )}
      </span>
      <MemberAction relation={relation} onAdd={onAdd} />
    </div>
  );
}

/**
 * The right-hand member list for a server: who belongs to it, split into online
 * and offline. Status is a point-in-time snapshot (fetched when you open the
 * server). Each member (that isn't you or already a friend) has an add-friend
 * control, since you can befriend people you share a server with.
 */
export function MemberList({
  communityId,
  relationshipOf,
  onAddFriend,
}: {
  communityId: string;
  relationshipOf: (userId: string) => FriendRelation;
  onAddFriend: (username: string) => void;
}) {
  const [members, setMembers] = useState<CommunityMember[]>([]);

  useEffect(() => {
    let active = true;
    api.get<CommunityMember[]>(`/api/communities/${communityId}/members`).then((m) => {
      if (active) setMembers(m);
    });
    return () => {
      active = false;
    };
  }, [communityId]);

  const online = members.filter((m) => m.status !== 'offline');
  const offline = members.filter((m) => m.status === 'offline');

  const row = (m: CommunityMember) => <MemberRow key={m.id} member={m} relation={relationshipOf(m.id)} onAdd={() => onAddFriend(m.username)} />;

  return (
    <aside
      className="scrollthin"
      style={{ width: 240, flex: 'none', background: theme.panel, borderLeft: '1px solid rgba(0,0,0,.2)', padding: 12, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 2 }}
    >
      {online.length > 0 && <div style={sectionLabel}>Online — {online.length}</div>}
      {online.map(row)}
      {offline.length > 0 && <div style={{ ...sectionLabel, marginTop: 10 }}>Offline — {offline.length}</div>}
      {offline.map(row)}
      {members.length === 0 && <div style={{ color: theme.textMuted, fontSize: 13, padding: 8 }}>No members yet.</div>}
    </aside>
  );
}
