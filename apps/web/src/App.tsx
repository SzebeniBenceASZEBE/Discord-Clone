import { useEffect, useState } from 'react';
import type { ServerEvent } from '@dc/shared';
import { theme } from './theme.ts';
import { ServerRail } from './components/ServerRail.tsx';
import { DmSidebar } from './components/DmSidebar.tsx';
import { ActiveNow } from './components/ActiveNow.tsx';

/**
 * Scaffold shell: the Discord-style three-pane home/Friends layout rebuilt from
 * the mockup. Real screens (channels, chat, voice) are added in later phases.
 * The connection pill proves the WebSocket path to the backend works.
 */
export function App() {
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
        <header
          style={{
            height: 48,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px',
            boxShadow: '0 1px 0 rgba(0,0,0,.2)',
            fontWeight: 600,
          }}
        >
          Friends
          <span
            title={connected ? 'Connected to backend' : 'Not connected'}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: connected ? theme.green : theme.textMuted,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? theme.green : theme.textMuted }} />
            {connected ? 'online' : 'offline'}
          </span>
        </header>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Scaffold ready — chat, channels, and voice come next.
        </div>
      </main>
      <ActiveNow />
    </div>
  );
}
