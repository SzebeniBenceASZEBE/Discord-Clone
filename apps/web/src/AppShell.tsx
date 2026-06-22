import { useEffect, useState } from 'react';
import type { ServerEvent } from '@dc/shared';
import { theme } from './theme.ts';
import { useAuth } from './auth/AuthContext.tsx';
import { ServerRail } from './components/ServerRail.tsx';
import { DmSidebar } from './components/DmSidebar.tsx';
import { ActiveNow } from './components/ActiveNow.tsx';

/**
 * The authenticated app: the three-pane home layout. Only rendered once the
 * bouncer (see App.tsx) confirms a logged-in user. The WebSocket connects here
 * because there's no point opening it before login.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (ev) => {
      const event = JSON.parse(ev.data) as ServerEvent;
      if (event.type === 'hello') setConnected(true);
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: theme.chatBg, color: theme.text }}>
      <ServerRail />
      <DmSidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxShadow: '0 1px 0 rgba(0,0,0,.2)', fontWeight: 600 }}>
          Friends
          <span title={connected ? 'Connected' : 'Offline'} style={{ marginLeft: 'auto', fontSize: 12, color: connected ? theme.green : theme.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? theme.green : theme.textMuted }} />
            {connected ? 'online' : 'offline'}
          </span>
          <span style={{ color: theme.textMuted, fontWeight: 400, fontSize: 13 }}>{user?.displayName}</span>
          <button
            onClick={() => logout()}
            style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.textMuted, borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            Log out
          </button>
        </header>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Logged in as {user?.username}. Chat, channels, and voice come next.
        </div>
      </main>
      <ActiveNow />
    </div>
  );
}
