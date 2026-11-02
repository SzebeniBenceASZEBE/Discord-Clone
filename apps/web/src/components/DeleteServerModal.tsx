import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Community } from '@dc/shared';
import { ApiError } from '../api.ts';
import { theme } from '../theme.ts';
import { errorStyle, labelStyle } from '../pages/authStyles.ts';

/**
 * Confirms deleting a server. Because this wipes all of its chat history and
 * files for good, we make the user type the server's exact name first (the same
 * guard GitHub uses for deleting a repo) so it can't happen on a stray click.
 */
export function DeleteServerModal({ community, onClose, onDelete }: { community: Community; onClose: () => void; onDelete: () => Promise<void> }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matches = typed.trim() === community.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete server');
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: theme.sidebar, borderRadius: 8, padding: 26 }}>
        <form onSubmit={submit}>
          <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Delete '{community.name}'</div>
          <div style={{ color: '#b5bac1', fontSize: 14, marginTop: 8, lineHeight: 1.4 }}>
            This permanently deletes the server, all of its channels, and every message and file in it. This can't be undone.
          </div>
          {error && <div style={errorStyle}>{error}</div>}
          <label style={labelStyle} htmlFor="confirm-name">
            Type <span style={{ color: '#f2f3f5', fontWeight: 600 }}>{community.name}</span> to confirm
          </label>
          <input id="confirm-name" className="auth-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: 11, fontSize: 15, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              style={{ flex: 1, background: theme.red, border: 'none', color: '#fff', borderRadius: 4, padding: 11, fontSize: 15, fontWeight: 500, cursor: matches && !busy ? 'pointer' : 'not-allowed', opacity: matches && !busy ? 1 : 0.5 }}
            >
              {busy ? 'Deleting…' : 'Delete server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
