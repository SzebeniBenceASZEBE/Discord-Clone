import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { ApiError } from '../api.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { buttonStyle, errorStyle, labelStyle } from './authStyles.ts';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already logged in? Skip the screen.
  if (user) return <Navigate to={next} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, marginBottom: 14 }}>

          </div>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Welcome back</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4 }}>Log in to your server</div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <label style={labelStyle} htmlFor="username">Username</label>
        <input id="username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle} htmlFor="password">Password</label>
          <button type="button" onClick={() => setShow((s) => !s)} style={{ background: 'none', border: 'none', color: '#949ba4', fontSize: 11, cursor: 'pointer', padding: 0 }}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <input id="password" className="auth-input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        <button type="submit" style={{ ...buttonStyle, opacity: busy ? 0.7 : 1 }} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/forgot" style={{ color: '#949ba4', fontSize: 13 }}>Forgot your password?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
