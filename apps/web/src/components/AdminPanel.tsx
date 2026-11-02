import { useState } from 'react';
import type { FormEvent } from 'react';
import type { IssuedResetCode, PasswordResetItem } from '@dc/shared';
import { theme } from '../theme.ts';
import { ApiError } from '../api.ts';

/**
 * Admin-only panel for password resets. Shows who asked, lets you generate a
 * one-time code (to pass on out-of-band), and dismiss entries. You can also
 * issue a code for any username proactively.
 */
export function AdminPanel({
  resets,
  onIssue,
  onDismiss,
  onClose,
}: {
  resets: PasswordResetItem[];
  onIssue: (username: string) => Promise<IssuedResetCode>;
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  // Codes we've just generated, kept so the admin can copy them. Keyed by
  // username (the server only returns a code once, at generation time).
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function issue(username: string) {
    setBusy(username);
    setError('');
    try {
      const out = await onIssue(username);
      setCodes((prev) => ({ ...prev, [out.username]: out.code }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a code');
    } finally {
      setBusy('');
    }
  }

  async function issueManual(e: FormEvent) {
    e.preventDefault();
    const name = manual.trim().toLowerCase();
    if (!name) return;
    await issue(name);
    setManual('');
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', background: theme.sidebar, borderRadius: 8, padding: 24 }} className="scrollthin">
        <div style={{ color: '#f2f3f5', fontSize: 20, fontWeight: 500 }}>Password resets</div>
        <div style={{ color: '#b5bac1', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
          Generate a one-time code and send it to the person privately (Discord, in person). They enter it on the “Forgot password” → reset screen. Codes expire in 24 hours.
        </div>

        {error && <div style={{ background: 'rgba(218,55,60,.12)', color: theme.red, borderRadius: 4, padding: '8px 10px', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {resets.length === 0 && <div style={{ color: theme.textMuted, fontSize: 13, padding: '8px 0' }}>No reset requests right now.</div>}
          {resets.map((r) => {
            const code = codes[r.username];
            return (
              <div key={r.id} style={{ background: theme.chatBg, borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: theme.text, fontWeight: 600 }}>{r.displayName} <span style={{ color: theme.textMuted, fontWeight: 400, fontSize: 12 }}>@{r.username}</span></div>
                    <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>{r.status === 'issued' ? 'Code issued — waiting for them to reset' : 'Requested a reset'}</div>
                  </div>
                  <button onClick={() => issue(r.username)} disabled={busy === r.username} style={{ background: theme.blurple, color: '#fff', border: 'none', borderRadius: 4, padding: '7px 10px', fontSize: 13, cursor: 'pointer', opacity: busy === r.username ? 0.6 : 1 }}>
                    {code ? 'New code' : r.status === 'issued' ? 'Re-issue' : 'Generate code'}
                  </button>
                  <button title="Dismiss" onClick={() => onDismiss(r.id)} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.textMuted, borderRadius: 4, padding: '7px 9px', fontSize: 13, cursor: 'pointer' }}>✕</button>
                </div>
                {code && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, background: '#1e1f22', color: theme.green, borderRadius: 4, padding: '8px 10px', fontSize: 18, letterSpacing: '2px', textAlign: 'center', fontFamily: 'monospace' }}>{code}</code>
                    <button onClick={() => navigator.clipboard.writeText(code)} style={{ background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}>Copy</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={issueManual} style={{ marginTop: 18, borderTop: `1px solid ${theme.divider}`, paddingTop: 16 }}>
          <div style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Reset someone directly</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="auth-input" style={{ marginTop: 0 }} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="username" autoComplete="off" />
            <button type="submit" disabled={!manual.trim() || busy === manual.trim().toLowerCase()} style={{ flex: 'none', background: theme.blurple, color: '#fff', border: 'none', borderRadius: 4, padding: '0 14px', fontSize: 14, cursor: 'pointer', opacity: !manual.trim() ? 0.6 : 1 }}>Generate</button>
          </div>
        </form>

        <button onClick={onClose} style={{ width: '100%', marginTop: 18, background: 'none', border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: 11, fontSize: 15, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}
