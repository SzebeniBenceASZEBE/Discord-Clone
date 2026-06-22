import { useEffect, useState } from 'react';
import type { Channel, Community, CreatedCommunity, CreatedInvite } from '@dc/shared';
import { theme } from './theme.ts';
import { api } from './api.ts';
import { useAuth } from './auth/AuthContext.tsx';
import { useSocket } from './socket/SocketContext.tsx';
import { ServerRail } from './components/ServerRail.tsx';
import { DmSidebar } from './components/DmSidebar.tsx';
import { ActiveNow } from './components/ActiveNow.tsx';
import { ChannelList } from './chat/ChannelList.tsx';
import { ChatView } from './chat/ChatView.tsx';
import { CreateServerModal } from './components/CreateServerModal.tsx';

/**
 * The authenticated app. Owns the navigation state — which server and channel
 * are selected — and fetches servers/channels from the API. The single
 * WebSocket lives one level up in <SocketProvider> (see App.tsx).
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load the servers the user belongs to.
  useEffect(() => {
    api.get<Community[]>('/api/communities').then(setCommunities);
  }, []);

  // When a server is selected, load its channels and open the first text one.
  useEffect(() => {
    if (!selectedCommunityId) {
      setChannels([]);
      setSelectedChannelId(null);
      return;
    }
    let active = true;
    api.get<Channel[]>(`/api/communities/${selectedCommunityId}/channels`).then((chs) => {
      if (!active) return;
      setChannels(chs);
      const firstText = chs.find((c) => c.kind === 'text');
      setSelectedChannelId(firstText?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, [selectedCommunityId]);

  const selectedCommunity = communities.find((c) => c.id === selectedCommunityId) ?? null;
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  async function createServer(name: string) {
    const created = await api.post<CreatedCommunity>('/api/communities', { name });
    setCommunities((prev) => [...prev, created.community]);
    setSelectedCommunityId(created.community.id);
    setChannels(created.channels);
    setSelectedChannelId(created.channels.find((c) => c.kind === 'text')?.id ?? null);
  }

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
      <ServerRail
        communities={communities}
        selectedCommunityId={selectedCommunityId}
        onSelectHome={() => setSelectedCommunityId(null)}
        onSelectCommunity={setSelectedCommunityId}
        onCreate={() => setShowCreate(true)}
      />

      {selectedCommunity ? (
        <ChannelList community={selectedCommunity} channels={channels} selectedChannelId={selectedChannelId} onSelectChannel={setSelectedChannelId} />
      ) : (
        <DmSidebar />
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxShadow: '0 1px 0 rgba(0,0,0,.2)', fontWeight: 600 }}>
          {selectedChannel ? (
            <span><span style={{ color: theme.textMuted }}>#</span> {selectedChannel.name}</span>
          ) : (
            'Friends'
          )}
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
            <button onClick={copyInvite} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy'}</button>
            <button onClick={() => setInviteUrl(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
        )}

        {selectedChannel ? (
          <ChatView channel={selectedChannel} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, textAlign: 'center', padding: 24 }}>
            {selectedCommunity ? 'Pick a text channel to start chatting.' : 'Select a server on the left, or create one with the + button.'}
          </div>
        )}
      </main>

      {!selectedCommunity && <ActiveNow />}

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} onCreate={createServer} />}
    </div>
  );
}
