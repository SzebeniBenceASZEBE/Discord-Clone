import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Channel, Community, CreatedCommunity, CreatedInvite, CreatedServerInvite, DmSummary, UserSummary } from '@dc/shared';
import { theme } from './theme.ts';
import { api } from './api.ts';
import { useAuth } from './auth/AuthContext.tsx';
import { ServerRail } from './components/ServerRail.tsx';
import { DmSidebar } from './components/DmSidebar.tsx';
import { ActiveNow } from './components/ActiveNow.tsx';
import { ChannelList } from './chat/ChannelList.tsx';
import { ChatView } from './chat/ChatView.tsx';
import { VoiceStage } from './voice/VoiceStage.tsx';
import { CreateServerModal } from './components/CreateServerModal.tsx';

/**
 * The authenticated app. Owns navigation: home (DMs) vs a selected server, and
 * which channel/DM is open. Both kinds of chat render through the same ChatView,
 * since a channel and a DM are both just "conversations".
 */
export function AppShell() {
  const { user, logout } = useAuth();

  // Servers + channels.
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // DMs.
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedDm, setSelectedDm] = useState<DmSummary | null>(null);

  // Invites (account invite or server invite — same banner).
  const [invite, setInvite] = useState<{ url: string; label: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    api.get<Community[]>('/api/communities').then(setCommunities);
    api.get<DmSummary[]>('/api/dms').then(setDms);
    api.get<UserSummary[]>('/api/users').then(setUsers);
    // After joining a server via a /join link, land on it.
    const justJoined = searchParams.get('server');
    if (justJoined) {
      setSelectedCommunityId(justJoined);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setSelectedChannelId(chs.find((c) => c.kind === 'text')?.id ?? null);
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

  function selectDm(dm: DmSummary) {
    setSelectedCommunityId(null);
    setSelectedDm(dm);
  }

  async function startDm(other: UserSummary) {
    const dm = await api.post<DmSummary>('/api/dms', { userId: other.id });
    setDms((prev) => (prev.some((d) => d.conversationId === dm.conversationId) ? prev : [dm, ...prev]));
    selectDm(dm);
  }

  async function makeInvite() {
    setInviteBusy(true);
    setCopied(false);
    try {
      const created = await api.post<CreatedInvite>('/api/invites');
      setInvite({ url: created.url, label: 'Account invite — single-use, expires in 7 days' });
    } finally {
      setInviteBusy(false);
    }
  }

  async function makeServerInvite(communityId: string, name: string) {
    setInviteBusy(true);
    setCopied(false);
    try {
      const created = await api.post<CreatedServerInvite>(`/api/communities/${communityId}/invites`);
      setInvite({ url: created.url, label: `Invite to ${name} — anyone logged in can join, expires in 7 days` });
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvite() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
  }

  // A selected voice channel opens the call view instead of a text conversation.
  const voiceChannel = selectedCommunity && selectedChannel?.kind === 'voice' ? selectedChannel : null;

  // The text conversation currently open in the main pane (channel or DM).
  const active = selectedCommunity
    ? selectedChannel?.kind === 'text'
      ? { id: selectedChannel.id, title: `# ${selectedChannel.name}`, placeholder: `Message #${selectedChannel.name}`, empty: `This is the start of #${selectedChannel.name}. Say hi!` }
      : null
    : selectedDm
      ? { id: selectedDm.conversationId, title: selectedDm.otherUser.displayName, placeholder: `Message ${selectedDm.otherUser.displayName}`, empty: `This is the very start of your DMs with ${selectedDm.otherUser.displayName}.` }
      : null;

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
        <ChannelList
          community={selectedCommunity}
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={setSelectedChannelId}
          onInvite={() => makeServerInvite(selectedCommunity.id, selectedCommunity.name)}
        />
      ) : (
        <DmSidebar dms={dms} users={users} selectedConversationId={selectedDm?.conversationId ?? null} onSelectDm={selectDm} onStartDm={startDm} />
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxShadow: '0 1px 0 rgba(0,0,0,.2)', fontWeight: 600 }}>
          {voiceChannel ? `🔊 ${voiceChannel.name}` : active ? active.title : 'Friends'}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {user?.isAdmin && (
              <button onClick={makeInvite} disabled={inviteBusy} style={{ background: theme.blurple, border: 'none', color: '#fff', borderRadius: 4, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                {inviteBusy ? 'Generating…' : 'Invite a friend'}
              </button>
            )}
            <button onClick={() => logout()} style={{ background: theme.sidebar, border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </header>

        {invite && (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: theme.sidebar, borderBottom: '1px solid rgba(0,0,0,.2)' }}>
            <span style={{ fontSize: 12, color: theme.textMuted }}>{invite.label}:</span>
            <code style={{ flex: 1, fontSize: 12, color: theme.text, background: theme.rail, padding: '6px 10px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.url}</code>
            <button onClick={copyInvite} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy'}</button>
            <button onClick={() => setInvite(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: 16, cursor: 'pointer' }}>×</button>
          </div>
        )}

        {voiceChannel ? (
          <VoiceStage channel={voiceChannel} />
        ) : active ? (
          <ChatView conversationId={active.id} composerPlaceholder={active.placeholder} emptyLabel={active.empty} />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, textAlign: 'center', padding: 24 }}>
            {selectedCommunity ? 'Pick a text channel to start chatting.' : 'Pick a conversation, or click someone under People to start a DM.'}
          </div>
        )}
      </main>

      {!selectedCommunity && !selectedDm && <ActiveNow />}

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} onCreate={createServer} />}
    </div>
  );
}
