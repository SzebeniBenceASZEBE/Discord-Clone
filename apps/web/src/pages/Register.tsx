import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { InviteInfo } from '@dc/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { api, ApiError } from '../api.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { buttonStyle, errorStyle, hintStyle, labelStyle } from './authStyles.ts';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function Register() {
  const { token = '' } = useParams();
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [check, setCheck] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Validate the invite before showing the form.
  useEffect(() => {
    api
      .get<InviteInfo>(`/api/invites/${token}`)
      .then((info) => setCheck(info.valid ? 'valid' : 'invalid'))
      .catch(() => setCheck('invalid'));
  }, [token]);

  if (user) return <Navigate to="/" replace />;

  const usernameOk = USERNAME_RE.test(username);
  // Only compare once they've started the confirm field, so the mismatch hint
  // doesn't flash while they're still typing the first password.
  const passwordsMatch = password === confirm;
  const canSubmit = displayName.trim() !== '' && usernameOk && password.length >= 8 && passwordsMatch && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await register({ inviteToken: token, username: username.trim(), displayName: displayName.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account');
    } finally {
      setBusy(false);
    }
  }

  if (check === 'checking') {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center', color: '#b5bac1', padding: '20px 0' }}>Checking your invite…</div>
      </AuthShell>
    );
  }

  if (check === 'invalid') {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#3a2a2a', color: '#f0b232', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>!</div>
          <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>This invite link is no longer valid</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 6 }}>It may have already been used or expired. Ask the admin for a new one.</div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>You&rsquo;re invited</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4 }}>Create your account to join</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: '#1a3a2a', color: '#3ba55c', fontSize: 12, padding: '4px 10px', borderRadius: 6 }}>
            Invitation valid
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <label style={labelStyle} htmlFor="displayName">Display name</label>
        <input id="displayName" className="auth-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />

        <label style={labelStyle} htmlFor="username">Username</label>
        <input id="username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" />
        <div style={{ ...hintStyle, color: username && !usernameOk ? '#f0888c' : '#80848e' }}>3–20 characters: a–z, 0–9, underscore</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle} htmlFor="password">Password</label>
          <button type="button" onClick={() => setShow((s) => !s)} style={{ background: 'none', border: 'none', color: '#949ba4', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <input id="password" className="auth-input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <div style={{ ...hintStyle, color: password && password.length < 8 ? '#f0888c' : '#80848e' }}>At least 8 characters</div>

        <label style={labelStyle} htmlFor="confirm">Confirm password</label>
        <input id="confirm" className="auth-input" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        <div style={{ ...hintStyle, color: confirm && !passwordsMatch ? '#f0888c' : '#80848e' }}>
          {confirm && !passwordsMatch ? "Passwords don't match" : 'Type it again to be sure'}
        </div>

        <button type="submit" style={{ ...buttonStyle, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'not-allowed' }} disabled={!canSubmit}>
          {busy ? 'Creating account…' : 'Create account & join'}
        </button>
      </form>
    </AuthShell>
  );
}
