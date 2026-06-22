import type { CSSProperties } from 'react';
import type { Community } from '@dc/shared';
import { theme, layout } from '../theme.ts';

const pill: CSSProperties = {
  width: 48,
  height: 48,
  flex: 'none',
  borderRadius: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#fff',
  fontWeight: 700,
};

/** The 72px rail: home, one pill per server the user belongs to, and create. */
export function ServerRail({
  communities,
  selectedCommunityId,
  onSelectHome,
  onSelectCommunity,
  onCreate,
}: {
  communities: Community[];
  selectedCommunityId: string | null;
  onSelectHome: () => void;
  onSelectCommunity: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <nav className="scrollthin" style={{ width: layout.railWidth, flex: 'none', background: theme.rail, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 8, overflowY: 'auto' }}>
      <div onClick={onSelectHome} style={{ ...pill, borderRadius: selectedCommunityId === null ? 14 : 24, background: selectedCommunityId === null ? theme.blurple : theme.sidebar }} title="Home">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5V15c0 .8-.7 1.5-1.5 1.5H10l-4 3.5V16.5H5.5C4.7 16.5 4 15.8 4 15V5.5Z" fill="currentColor" />
        </svg>
      </div>
      <div style={{ width: 32, height: 2, flex: 'none', background: theme.divider, borderRadius: 1, margin: '2px 0' }} />
      {communities.map((c) => (
        <div
          key={c.id}
          onClick={() => onSelectCommunity(c.id)}
          title={c.name}
          style={{ ...pill, background: c.color, fontSize: 15, letterSpacing: '.3px', borderRadius: c.id === selectedCommunityId ? 14 : 16, outline: c.id === selectedCommunityId ? `2px solid ${theme.text}` : 'none' }}
        >
          {c.label}
        </div>
      ))}
      <div onClick={onCreate} style={{ ...pill, borderRadius: 24, background: theme.sidebar, color: theme.green }} title="Create a server">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>
    </nav>
  );
}
