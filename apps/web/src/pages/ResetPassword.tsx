import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { ApiError } from '../api.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { buttonStyle, errorStyle, hintStyle, labelStyle } from './authStyles.ts';

/**
 * Set a new password using the one-time code the admin sent. On success the
 * server logs you straight in (and kills your old sessions elsewhere).
 */
export function ResetPassword() {
  const { user, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const passwordsMatch = password === confirm;
  const canSubmit = username.trim() !== '' && code.trim() !== '' && password.length >= 8 && passwordsMatch && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await resetPassword({ username: username.trim(), code: code.trim(), password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset your password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Reset your password</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4, textAlign: 'center' }}>Enter the code the admin sent you and pick a new password.</div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <label style={labelStyle} htmlFor="username">Username</label>
        <input id="username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />

        <label style={labelStyle} htmlFor="code">Reset code</label>
        <input id="code" className="auth-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="one-time-code" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle} htmlFor="password">New password</label>
          <button type="button" onClick={() => setShow((s) => !s)} style={{ background: 'none', border: 'none', color: '#949ba4', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <input id="password" className="auth-input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <div style={{ ...hintStyle, color: password && password.length < 8 ? '#f0888c' : '#80848e' }}>At least 8 characters</div>

        <label style={labelStyle} htmlFor="confirm">Confirm new password</label>
        <input id="confirm" className="auth-input" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        <div style={{ ...hintStyle, color: confirm && !passwordsMatch ? '#f0888c' : '#80848e' }}>
          {confirm && !passwordsMatch ? "Passwords don't match" : 'Type it again to be sure'}
        </div>

        <button type="submit" style={{ ...buttonStyle, opacity: canSubmit ? 1 : 0.6, cursor: canSubmit ? 'pointer' : 'not-allowed' }} disabled={!canSubmit}>
          {busy ? 'Resetting…' : 'Set new password & log in'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/login" style={{ color: '#949ba4', fontSize: 13 }}>Back to log in</Link>
        </div>
      </form>
    </AuthShell>
  );
}
