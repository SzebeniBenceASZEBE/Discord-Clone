import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Channel, Community, CreatedCommunity, CreatedInvite, CreatedServerInvite, DmSummary, FriendRelation, FriendsData, IssuedResetCode, PasswordResetItem, UserSummary } from '@dc/shared';
import { theme } from './theme.ts';
import { api } from './api.ts';
import { useAuth } from './auth/AuthContext.tsx';
import { useSocket } from './socket/SocketContext.tsx';
import { useIsMobile } from './useIsMobile.ts';
import { ServerRail } from './components/ServerRail.tsx';
import { DmSidebar } from './components/DmSidebar.tsx';
import { ActiveNow } from './components/ActiveNow.tsx';
import { MemberList } from './components/MemberList.tsx';
import { ChannelList } from './chat/ChannelList.tsx';
import { ChatView } from './chat/ChatView.tsx';
import { VoiceStage } from './voice/VoiceStage.tsx';
import { CreateServerModal } from './components/CreateServerModal.tsx';
import { DeleteServerModal } from './components/DeleteServerModal.tsx';
import { AddFriendModal } from './components/AddFriendModal.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';

/**
 * The authenticated app. Owns navigation: home (DMs) vs a selected server, and
 * which channel/DM is open. Both kinds of chat render through the same ChatView,
 * since a channel and a DM are both just "conversations".
 *
 * Layout is responsive: on desktop the server rail + sidebar + chat + "active
 * now" sit side by side; on phones only the chat shows, and the rail + sidebar
 * slide in as a single drawer behind a ☰ button.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const { onCommunityDeleted, onFriendChanged, onPasswordResetRequested } = useSocket();
  const isMobile = useIsMobile();

  // Servers + channels.
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Community | null>(null);

  // DMs + friends.
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [friends, setFriends] = useState<FriendsData>({ friends: [], incoming: [], outgoing: [] });
  const [selectedDm, setSelectedDm] = useState<DmSummary | null>(null);
  const [showAddFriend, setShowAddFriend] = useState(false);

  // Admin: password-reset requests (only loaded/used when you're the admin).
  const [resets, setResets] = useState<PasswordResetItem[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Invites (account invite or server invite — same banner).
  const [invite, setInvite] = useState<{ url: string; label: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mobile nav drawer (ignored on desktop, where the rail + sidebar are always on).
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    api.get<Community[]>('/api/communities').then(setCommunities);
    api.get<DmSummary[]>('/api/dms').then(setDms);
    api.get<FriendsData>('/api/friends').then(setFriends);
    // After joining a server via a /join link, land on it.
    const justJoined = searchParams.get('server');
    if (justJoined) {
      setSelectedCommunityId(justJoined);
      setSearchParams({}, { replace: true });
    }
    // On a phone, open the nav drawer on first load so there's somewhere to go.
    if (window.innerWidth < 768) setDrawerOpen(true);
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

  // After picking an actual conversation on a phone, close the drawer so the
  // chat comes to the front. Picking a *server* keeps it open (you still need to
  // pick a channel next). A no-op on desktop.
  const closeDrawerOnMobile = () => {
    if (isMobile) setDrawerOpen(false);
  };

  async function createServer(name: string) {
    const created = await api.post<CreatedCommunity>('/api/communities', { name });
    setCommunities((prev) => [...prev, created.community]);
    setSelectedCommunityId(created.community.id);
    setChannels(created.channels);
    setSelectedChannelId(created.channels.find((c) => c.kind === 'text')?.id ?? null);
  }

  // Drop a server from the rail. Also used when someone else deletes it: if
  // we're currently looking at it, fall back to Home so we're not staring at a
  // server that no longer exists.
  function removeCommunity(id: string) {
    setCommunities((prev) => prev.filter((c) => c.id !== id));
    setSelectedCommunityId((cur) => (cur === id ? null : cur));
  }

  async function deleteServer(community: Community) {
    await api.del<void>(`/api/communities/${community.id}`);
    removeCommunity(community.id);
  }

  // Live removal: the server tells every client when a server is deleted.
  useEffect(() => onCommunityDeleted(removeCommunity), [onCommunityDeleted]);

  // Who may delete a given server: its owner, or the admin (you). The default
  // Main Hall is never deletable.
  function canDeleteCommunity(c: Community): boolean {
    return !c.isDefault && (c.ownerId === user?.id || user?.isAdmin === true);
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

  // --- Friends. Each mutation returns the fresh FriendsData; the server also
  // pushes friend.changed to the *other* person so their list updates live. ---
  const loadFriends = () => api.get<FriendsData>('/api/friends').then(setFriends);

  async function sendFriendRequest(username: string) {
    setFriends(await api.post<FriendsData>('/api/friends/requests', { username }));
  }
  async function acceptRequest(id: string) {
    setFriends(await api.post<FriendsData>(`/api/friends/requests/${id}/accept`));
  }
  async function removeRequest(id: string) {
    setFriends(await api.del<FriendsData>(`/api/friends/requests/${id}`));
  }

  // Our relationship to another user, so the member list knows which control to
  // show (add / pending / nothing).
  function relationshipOf(userId: string): FriendRelation {
    if (userId === user?.id) return 'self';
    if (friends.friends.some((f) => f.id === userId)) return 'friend';
    if (friends.incoming.some((r) => r.user.id === userId)) return 'incoming';
    if (friends.outgoing.some((r) => r.user.id === userId)) return 'outgoing';
    return 'none';
  }

  // Add-friend from the member list: send by username (the server auto-accepts
  // if they'd already requested us). Errors are swallowed here — the dedicated
  // Add Friend modal is where we surface "already friends" etc.
  function addFriendByUsername(username: string) {
    sendFriendRequest(username).catch(() => {});
  }

  // Live: refetch our friends whenever anything changes on either side.
  useEffect(() => onFriendChanged(() => void loadFriends()), [onFriendChanged]);

  // --- Admin: password resets (admin only). ---
  const isAdmin = user?.isAdmin === true;
  const loadResets = () => (isAdmin ? api.get<PasswordResetItem[]>('/api/admin/password-resets').then(setResets) : Promise.resolve());

  async function issueResetCode(username: string): Promise<IssuedResetCode> {
    const out = await api.post<IssuedResetCode>('/api/admin/password-resets/issue', { username });
    await loadResets();
    return out;
  }
  async function dismissReset(id: string) {
    await api.del(`/api/admin/password-resets/${id}`);
    await loadResets();
  }

  useEffect(() => {
    if (isAdmin) void loadResets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Live: a new reset request pops a toast and refreshes the admin list.
  useEffect(
    () =>
      onPasswordResetRequested(() => {
        void loadResets();
        setToast('Someone requested a password reset');
        setTimeout(() => setToast(null), 6000);
      }),
    [onPasswordResetRequested],
  );

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

  // --- Shared building blocks, arranged differently per layout below. ---

  const serverRail = (
    <ServerRail
      communities={communities}
      selectedCommunityId={selectedCommunityId}
      onSelectHome={() => setSelectedCommunityId(null)}
      onSelectCommunity={setSelectedCommunityId}
      onCreate={() => setShowCreate(true)}
      canDelete={canDeleteCommunity}
      onRequestDelete={setDeleteTarget}
    />
  );

  const sidebar = selectedCommunity ? (
    <ChannelList
      community={selectedCommunity}
      channels={channels}
      selectedChannelId={selectedChannelId}
      onSelectChannel={(id) => {
        setSelectedChannelId(id);
        closeDrawerOnMobile();
      }}
      onInvite={() => makeServerInvite(selectedCommunity.id, selectedCommunity.name)}
    />
  ) : (
    <DmSidebar
      dms={dms}
      friends={friends.friends}
      incoming={friends.incoming}
      outgoing={friends.outgoing}
      selectedConversationId={selectedDm?.conversationId ?? null}
      onSelectDm={(dm) => {
        selectDm(dm);
        closeDrawerOnMobile();
      }}
      onStartDm={(u) => {
        startDm(u);
        closeDrawerOnMobile();
      }}
      onAddFriend={() => setShowAddFriend(true)}
      onAccept={acceptRequest}
      onDecline={removeRequest}
      onCancel={removeRequest}
      isAdmin={isAdmin}
      resetBadge={resets.length}
      onOpenAdmin={() => setShowAdmin(true)}
    />
  );

  const mainPane = (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <header style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxShadow: '0 1px 0 rgba(0,0,0,.2)', fontWeight: 600 }}>
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            style={{ background: 'none', border: 'none', color: theme.text, fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: '4px 6px', marginLeft: -6, flex: 'none' }}
          >
            ☰
          </button>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {voiceChannel ? `🔊 ${voiceChannel.name}` : active ? active.title : 'Friends'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          {user?.isAdmin && (
            <button onClick={makeInvite} disabled={inviteBusy} style={{ background: theme.blurple, border: 'none', color: '#fff', borderRadius: 4, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {inviteBusy ? 'Generating…' : isMobile ? 'Invite' : 'Invite a friend'}
            </button>
          )}
          <button onClick={() => logout()} style={{ background: theme.sidebar, border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '7px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {isMobile ? 'Exit' : 'Log out'}
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
          {selectedCommunity ? 'Pick a text channel to start chatting.' : 'Pick a conversation, or start a DM with a friend.'}
        </div>
      )}
    </main>
  );

  const frame = { display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: theme.chatBg, color: theme.text } as const;

  // --- Mobile: chat full-screen, rail + sidebar as one slide-in drawer. ---
  if (isMobile) {
    return (
      <div style={{ ...frame, position: 'relative' }}>
        {mainPane}

        {drawerOpen && (
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} />
        )}

        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            display: 'flex',
            zIndex: 50,
            transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform .22s ease',
            boxShadow: drawerOpen ? '2px 0 16px rgba(0,0,0,.5)' : 'none',
          }}
        >
          {serverRail}
          {sidebar}
        </div>

        {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} onCreate={createServer} />}
        {deleteTarget && <DeleteServerModal community={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={() => deleteServer(deleteTarget)} />}
        {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} onSend={sendFriendRequest} />}
        {showAdmin && <AdminPanel resets={resets} onIssue={issueResetCode} onDismiss={dismissReset} onClose={() => setShowAdmin(false)} />}
        {toast && <Toast message={toast} onClick={() => { setToast(null); setShowAdmin(true); }} />}
      </div>
    );
  }

  // --- Desktop: everything side by side. ---
  return (
    <div style={frame}>
      {serverRail}
      {sidebar}
      {mainPane}
      {selectedCommunity ? <MemberList communityId={selectedCommunity.id} relationshipOf={relationshipOf} onAddFriend={addFriendByUsername} /> : !selectedDm ? <ActiveNow /> : null}
      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} onCreate={createServer} />}
      {deleteTarget && <DeleteServerModal community={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={() => deleteServer(deleteTarget)} />}
      {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} onSend={sendFriendRequest} />}
      {showAdmin && <AdminPanel resets={resets} onIssue={issueResetCode} onDismiss={dismissReset} onClose={() => setShowAdmin(false)} />}
      {toast && <Toast message={toast} onClick={() => { setToast(null); setShowAdmin(true); }} />}
    </div>
  );
}

/** A small transient banner (used for the live "reset requested" nudge). */
function Toast({ message, onClick }: { message: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: theme.blurple, color: '#fff', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      {message}
      <span style={{ fontSize: 12, opacity: 0.85, textDecoration: 'underline' }}>Open</span>
    </div>
  );
}
