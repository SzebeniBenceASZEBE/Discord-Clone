import { useEffect, useState } from 'react';
import type { CreatedInvite, ServerEvent } from '@dc/shared';
import { theme } from './theme.ts';
import { api } from './api.ts';
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function makeInvite() {
    setInviteBusy(true);
    setCopied(false);
    try {
      const invite = await api.post<CreatedInvite>('/api/invites');
      setInviteUrl(invite.url);
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

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
          {user?.isAdmin && (
            <button onClick={makeInvite} disabled={inviteBusy} style={{ background: theme.blurple, border: 'none', color: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              {inviteBusy ? 'Generating…' : 'Invite a friend'}
            </button>
          )}
          <span style={{ color: theme.textMuted, fontWeight: 400, fontSize: 13 }}>{user?.displayName}</span>
          <button onClick={() => logout()} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.textMuted, borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            Log out
          </button>
        </header>

        {inviteUrl && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: theme.sidebar, borderBottom: '1px solid rgba(0,0,0,.2)' }}>
            <span style={{ fontSize: 12, color: theme.textMuted }}>Single-use invite link (expires in 7 days):</span>
            <code style={{ flex: 1, fontSize: 12, color: theme.text, background: theme.rail, padding: '6px 10px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteUrl}</code>
            <button onClick={copyInvite} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => setInviteUrl(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Logged in as {user?.username}. Chat, channels, and voice come next.
        </div>
      </main>
      <ActiveNow />
    </div>
  );
}
