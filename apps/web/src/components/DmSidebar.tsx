import type { User } from '@dc/shared';
import { theme, layout } from '../theme.ts';

const demoDms: Pick<User, 'id' | 'displayName' | 'status'>[] = [
  { id: 'a', displayName: 'alex', status: 'online' },
  { id: 'b', displayName: 'sam', status: 'idle' },
  { id: 'c', displayName: 'jordan', status: 'offline' },
];

const statusColor: Record<User['status'], string> = {
  online: theme.green,
  idle: '#f0b232',
  dnd: '#f23f43',
  offline: theme.textMuted,
};

export function DmSidebar() {
  return (
    <aside
      style={{
        width: layout.sidebarWidth,
        flex: 'none',
        background: theme.sidebar,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: layout.topBarHeight, flex: 'none', padding: 8, boxShadow: '0 1px 0 rgba(0,0,0,.2)' }}>
        <button
          style={{
            width: '100%',
            height: '100%',
            textAlign: 'left',
            padding: '0 8px',
            background: 'rgba(0,0,0,.2)',
            border: 'none',
            borderRadius: 4,
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Find or start a conversation
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scrollthin">
        <div style={{ padding: '4px 8px', color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Direct Messages
        </div>
        {demoDms.map((dm) => (
          <div
            key={dm.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', color: theme.textMuted }}
          >
            <div style={{ position: 'relative', width: 32, height: 32, flex: 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: theme.hover }} />
              <span
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: statusColor[dm.status],
                  border: `3px solid ${theme.sidebar}`,
                }}
              />
            </div>
            <span style={{ color: theme.text }}>{dm.displayName}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
