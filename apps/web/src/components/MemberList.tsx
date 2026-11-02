import { useEffect, useState } from 'react';
import type { CommunityMember } from '@dc/shared';
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

function MemberRow({ member }: { member: CommunityMember }) {
  const offline = member.status === 'offline';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 4, opacity: offline ? 0.45 : 1 }}>
      <Avatar name={member.displayName} id={member.id} size={32} status={member.status} ringColor={theme.panel} />
      <span style={{ color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {member.displayName}
        {member.role === 'owner' && (
          <span title="Server owner" style={{ marginLeft: 6 }}>
            👑
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The right-hand member list for a server: who belongs to it, split into online
 * and offline. Status is a point-in-time snapshot (fetched when you open the
 * server) — live presence updates can come later.
 */
export function MemberList({ communityId }: { communityId: string }) {
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

  return (
    <aside
      className="scrollthin"
      style={{ width: 240, flex: 'none', background: theme.panel, borderLeft: '1px solid rgba(0,0,0,.2)', padding: 12, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 2 }}
    >
      {online.length > 0 && <div style={sectionLabel}>Online — {online.length}</div>}
      {online.map((m) => (
        <MemberRow key={m.id} member={m} />
      ))}
      {offline.length > 0 && <div style={{ ...sectionLabel, marginTop: 10 }}>Offline — {offline.length}</div>}
      {offline.map((m) => (
        <MemberRow key={m.id} member={m} />
      ))}
      {members.length === 0 && <div style={{ color: theme.textMuted, fontSize: 13, padding: 8 }}>No members yet.</div>}
    </aside>
  );
}
