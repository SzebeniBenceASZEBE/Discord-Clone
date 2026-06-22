import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AttachmentRef, Message } from '@dc/shared';
import { api, uploadFile } from '../api.ts';
import { theme } from '../theme.ts';
import { useSocket } from '../socket/SocketContext.tsx';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Attachment({ att }: { att: AttachmentRef }) {
  const href = `/api/attachments/${att.id}`;
  if (att.mime.startsWith('image/')) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6 }}>
        <img src={href} alt={att.filename} style={{ maxWidth: 400, maxHeight: 300, borderRadius: 6, display: 'block' }} />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" download={att.filename} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, padding: '10px 12px', background: theme.sidebar, border: `1px solid ${theme.divider}`, borderRadius: 6, maxWidth: 400, textDecoration: 'none', color: theme.text }}>
      <span style={{ fontSize: 20 }}>📄</span>
      <span style={{ minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</div>
        <div style={{ fontSize: 11, color: theme.textMuted }}>{formatBytes(att.size)}</div>
      </span>
    </a>
  );
}

/**
 * Shows one conversation — a channel OR a DM. Loads history over REST, stays
 * live via the shared WebSocket, and lets you attach files.
 */
export function ChatView({ conversationId, composerPlaceholder, emptyLabel }: { conversationId: string; composerPlaceholder: string; emptyLabel: string }) {
  const { subscribe, unsubscribe, onMessageCreated } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<AttachmentRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setMessages([]);
    setPending([]);
    setText('');
    api.get<Message[]>(`/api/conversations/${conversationId}/messages`).then((history) => {
      if (active) setMessages(history);
    });
    subscribe(conversationId);
    const off = onMessageCreated((msg) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => {
      active = false;
      unsubscribe(conversationId);
      off();
    };
  }, [conversationId, subscribe, unsubscribe, onMessageCreated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const ref = await uploadFile<AttachmentRef>(`/api/conversations/${conversationId}/attachments`, file);
      setPending((prev) => [...prev, ref]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content && pending.length === 0) return;
    setText('');
    const attachmentIds = pending.map((a) => a.id);
    setPending([]);
    await api.post(`/api/conversations/${conversationId}/messages`, { content, attachmentIds });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', minHeight: 0 }} className="scrollthin">
        {messages.length === 0 ? (
          <div style={{ color: theme.textMuted, padding: '8px 0' }}>{emptyLabel}</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ padding: '4px 0' }}>
              <span style={{ fontWeight: 600, color: theme.text }}>{m.authorName ?? 'unknown'}</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: theme.textMuted }}>{formatTime(m.createdAt)}</span>
              {m.content && <div style={{ color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>}
              {m.attachments.map((att) => <Attachment key={att.id} att={att} />)}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {pending.length > 0 && (
        <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' }}>
          {pending.map((a) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.sidebar, border: `1px solid ${theme.divider}`, borderRadius: 4, padding: '4px 8px', fontSize: 12 }}>
              {a.filename}
              <button type="button" onClick={() => setPending((prev) => prev.filter((p) => p.id !== a.id))} aria-label="Remove" style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={send} style={{ flex: 'none', padding: '0 16px 16px', display: 'flex', gap: 8 }}>
        <input ref={fileInputRef} type="file" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach a file" style={{ background: theme.sidebar, border: `1px solid ${theme.divider}`, color: theme.text, borderRadius: 4, padding: '0 12px', fontSize: 18, cursor: 'pointer' }}>
          {uploading ? '…' : '+'}
        </button>
        <input className="auth-input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={composerPlaceholder} aria-label={composerPlaceholder} />
        <button type="submit" style={{ background: theme.blurple, border: 'none', color: '#fff', borderRadius: 4, padding: '0 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </div>
  );
}
