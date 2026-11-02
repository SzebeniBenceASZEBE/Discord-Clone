import { useEffect, useState } from 'react';
import type { CommunityMember, UserSummary } from '@dc/shared';
import { theme } from '../theme.ts';
import { api, ApiError } from '../api.ts';
import { Avatar } from './Avatar.tsx';

/**
 * Invite people to a server. Primary path: pick from your friends who aren't
 * already in it — they get a pending invite in-app (no link needed). A copy-link
 * fallback is kept for inviting people who aren't your friends yet.
 */
export function ServerInviteModal({
  communityId,
  communityName,
  friends,
  onInvite,
  onCopyLink,
  onClose,
}: {
  communityId: string;
  communityName: string;
  friends: UserSummary[];
  onInvite: (communityId: string, username: string) => Promise<void>;
  onCopyLink: () => Promise<void>;
  onClose: () => void;
}) {
  const [memberIds, setMemberIds] = useState<Set<string> | null>(null);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<CommunityMember[]>(`/api/communities/${communityId}/members`).then((m) => {
      if (active) setMemberIds(new Set(m.map((x) => x.id)));
    });
    return () => {
      active = false;
    };
  }, [communityId]);

  const invitable = memberIds ? friends.filter((f) => !memberIds.has(f.id)) : [];

  async function invite(username: string) {
    setBusy(username);
    setError('');
    try {
      await onInvite(communityId, username);
      setInvited((p) => ({ ...p, [username]: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send invite');
    } finally {
      setBusy('');
    }
  }

  async function copyLink() {
    try {
      await onCopyLink();
      setLinkCopied(true);
    } catch {
      setError('Could not create a link');
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: theme.sidebar, borderRadius: 8, padding: 22 }}>
        <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>Invite to {communityName}</div>
        <div style={{ color: '#b5bac1', fontSize: 13, marginTop: 4 }}>Pick a friend to invite — they’ll get an invite in the app.</div>
        {error && <div style={{ background: 'rgba(218,55,60,.12)', color: theme.red, borderRadius: 4, padding: '8px 10px', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div className="scrollthin" style={{ flex: 1, overflowY: 'auto', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 60 }}>
          {memberIds === null && <div style={{ color: theme.textMuted, fontSize: 13, padding: 8 }}>Loading…</div>}
          {memberIds !== null && invitable.length === 0 && (
            <div style={{ color: theme.textMuted, fontSize: 13, padding: 8, lineHeight: 1.5 }}>
              {friends.length === 0 ? 'Add some friends first, or share a link below.' : 'All your friends are already in this server.'}
            </div>
          )}
          {invitable.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 4 }}>
              <Avatar name={f.displayName} id={f.id} size={32} status={f.status} ringColor={theme.sidebar} />
              <span style={{ flex: 1, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.displayName}</span>
              {invited[f.username] ? (
                <span style={{ color: theme.green, fontSize: 13, fontWeight: 600 }}>Invited ✓</span>
              ) : (
                <button onClick={() => invite(f.username)} disabled={busy === f.username} style={{ background: theme.green, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy === f.username ? 0.6 : 1 }}>
                  {busy === f.username ? '…' : 'Invite'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${theme.divider}`, marginTop: 14, paddingTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={copyLink} style={{ flex: 1, background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: 10, fontSize: 14, cursor: 'pointer' }}>
            {linkCopied ? 'Link copied ✓' : 'Copy invite link'}
          </button>
          <button onClick={onClose} style={{ flex: 1, background: theme.blurple, color: '#fff', border: 'none', borderRadius: 4, padding: 10, fontSize: 14, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
