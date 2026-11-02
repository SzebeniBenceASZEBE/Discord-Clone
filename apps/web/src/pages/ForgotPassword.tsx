import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { api, ApiError } from '../api.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { buttonStyle, errorStyle, labelStyle } from './authStyles.ts';

/**
 * "Forgot password" — there's no email in this app, so this just pings the
 * admin. We always show the same confirmation (never revealing whether the
 * username exists) and the admin sends back a one-time code out-of-band.
 */
export function ForgotPassword() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/forgot', { username: username.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {sent ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#1a3a2a', color: '#3ba55c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>✓</div>
          <div style={{ color: '#f2f3f5', fontSize: 18, fontWeight: 500 }}>Request sent</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            If that account exists, the admin has been notified. They’ll send you a one-time reset code.
          </div>
          <Link to="/reset" style={{ ...buttonStyle, display: 'block', textDecoration: 'none', textAlign: 'center', marginTop: 20 }}>
            I have a code
          </Link>
          <Link to="/login" style={{ color: '#949ba4', fontSize: 13, display: 'inline-block', marginTop: 14 }}>Back to log in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Forgot your password?</div>
            <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4, textAlign: 'center' }}>Enter your username and the admin will send you a reset code.</div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <label style={labelStyle} htmlFor="username">Username</label>
          <input id="username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />

          <button type="submit" style={{ ...buttonStyle, opacity: busy || !username.trim() ? 0.6 : 1 }} disabled={busy || !username.trim()}>
            {busy ? 'Sending…' : 'Request a reset'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14, display: 'flex', justifyContent: 'center', gap: 14 }}>
            <Link to="/login" style={{ color: '#949ba4', fontSize: 13 }}>Back to log in</Link>
            <Link to="/reset" style={{ color: '#949ba4', fontSize: 13 }}>I already have a code</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
