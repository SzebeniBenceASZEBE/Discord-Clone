import { useEffect, useState } from 'react';
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

/** Where a right-click context menu is open, and for which community. */
interface MenuState {
  community: Community;
  x: number;
  y: number;
}

/** The 72px rail: home, one pill per server the user belongs to, and create. */
export function ServerRail({
  communities,
  selectedCommunityId,
  onSelectHome,
  onSelectCommunity,
  onCreate,
  canDelete,
  onRequestDelete,
}: {
  communities: Community[];
  selectedCommunityId: string | null;
  onSelectHome: () => void;
  onSelectCommunity: (id: string) => void;
  onCreate: () => void;
  /** Whether the right-click menu should offer "Delete" for this server. */
  canDelete: (community: Community) => boolean;
  onRequestDelete: (community: Community) => void;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Any click/scroll/Escape anywhere dismisses the context menu.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

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
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ community: c, x: e.clientX, y: e.clientY });
          }}
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

      {menu && (
        <div
          // The menu floats at the cursor. stopPropagation so clicking an item
          // doesn't trigger the window-level "close" before it runs.
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: menu.y, left: menu.x, background: '#111214', borderRadius: 6, padding: 6, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 60 }}
        >
          {canDelete(menu.community) ? (
            <button
              onClick={() => {
                onRequestDelete(menu.community);
                setMenu(null);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', color: theme.red, fontSize: 14, padding: '8px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.red;
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = theme.red;
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Delete Server
            </button>
          ) : (
            <div style={{ color: theme.textMuted, fontSize: 13, padding: '8px 10px' }}>No actions available</div>
          )}
        </div>
      )}
    </nav>
  );
}
