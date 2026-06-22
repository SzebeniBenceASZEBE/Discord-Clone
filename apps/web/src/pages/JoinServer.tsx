import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { CreatedCommunity, ServerInviteInfo } from '@dc/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { api, ApiError } from '../api.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { buttonStyle, errorStyle } from './authStyles.ts';

/** Landing page for a /join/<token> server-invite link. */
export function JoinServer() {
  const { token = '' } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ServerInviteInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    api
      .get<ServerInviteInfo>(`/api/server-invites/${token}`)
      .then(setInfo)
      .catch(() => setInfo({ valid: false, reason: 'unknown' }));
  }, [user, token]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const joined = await api.post<CreatedCommunity>(`/api/server-invites/${token}/accept`);
      navigate(`/?server=${joined.community.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join');
      setBusy(false);
    }
  }

  if (loading) {
    return <AuthShell><div style={{ textAlign: 'center', color: '#b5bac1', padding: '20px 0' }}>Loading…</div></AuthShell>;
  }

  // Not logged in: go log in, then come straight back to this link.
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/join/${token}`)}`} replace />;
  }

  return (
    <AuthShell>
      {!info ? (
        <div style={{ textAlign: 'center', color: '#b5bac1', padding: '20px 0' }}>Checking invite…</div>
      ) : !info.valid ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>This server invite is no longer valid</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 6 }}>It may have expired — ask whoever invited you for a fresh link.</div>
        </div>
      ) : info.alreadyMember ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>You&rsquo;re already in {info.communityName}</div>
          <button onClick={() => navigate('/', { replace: true })} style={buttonStyle}>Go to the app</button>
        </div>
      ) : (
        <form onSubmit={accept} style={{ textAlign: 'center' }}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Join {info.communityName}?</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4 }}>You&rsquo;ll get access to its text and voice channels.</div>
          {error && <div style={errorStyle}>{error}</div>}
          <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Joining…' : `Join ${info.communityName}`}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
