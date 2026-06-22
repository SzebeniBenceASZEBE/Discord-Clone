import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api.ts';
import { theme } from '../theme.ts';
import { buttonStyle, errorStyle, labelStyle } from '../pages/authStyles.ts';

export function CreateServerModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create server');
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: theme.sidebar, borderRadius: 8, padding: 26 }}>
        <form onSubmit={submit}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500, textAlign: 'center' }}>Create a server</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 4, textAlign: 'center' }}>It gets a text and a voice channel to start.</div>
          {error && <div style={errorStyle}>{error}</div>}
          <label style={labelStyle} htmlFor="server-name">Server name</label>
          <input id="server-name" className="auth-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: 11, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={busy} style={{ ...buttonStyle, flex: 1, marginTop: 0, opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
