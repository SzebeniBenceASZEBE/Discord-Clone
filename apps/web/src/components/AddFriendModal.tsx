import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api.ts';
import { theme } from '../theme.ts';
import { buttonStyle, errorStyle, labelStyle } from '../pages/authStyles.ts';

/**
 * Add a friend by exact username. There's no user directory to browse (that's
 * the privacy trade-off we chose), so you type the handle your friend tells you.
 */
export function AddFriendModal({ onClose, onSend }: { onClose: () => void; onSend: (username: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    setSent('');
    try {
      await onSend(name);
      setSent(`Request sent to ${name}.`);
      setUsername('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: theme.sidebar, borderRadius: 8, padding: 26 }}>
        <form onSubmit={submit}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Add a friend</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4 }}>Enter their exact username.</div>
          {error && <div style={errorStyle}>{error}</div>}
          {sent && <div style={{ background: 'rgba(35,165,90,.12)', color: theme.green, borderRadius: 4, padding: '8px 10px', fontSize: 13, marginTop: 12 }}>{sent}</div>}
          <label style={labelStyle} htmlFor="friend-username">Username</label>
          <input id="friend-username" className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="off" />
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: 11, fontSize: 15, cursor: 'pointer' }}>
              Close
            </button>
            <button type="submit" disabled={busy || !username.trim()} style={{ ...buttonStyle, flex: 1, marginTop: 0, opacity: busy || !username.trim() ? 0.6 : 1 }}>
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
