import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Channel, Message } from '@dc/shared';
import { api } from '../api.ts';
import { theme } from '../theme.ts';
import { useSocket } from '../socket/SocketContext.tsx';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatView({ channel }: { channel: Channel }) {
  const { subscribe, unsubscribe, onMessageCreated } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history + go live whenever the open channel changes.
  useEffect(() => {
    let active = true;
    setMessages([]);
    api.get<Message[]>(`/api/conversations/${channel.id}/messages`).then((history) => {
      if (active) setMessages(history);
    });
    subscribe(channel.id);
    const off = onMessageCreated((msg) => {
      if (msg.conversationId !== channel.id) return;
      setMessages((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => {
      active = false;
      unsubscribe(channel.id);
      off();
    };
  }, [channel.id, subscribe, unsubscribe, onMessageCreated]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    // The message comes back to us via the WebSocket broadcast, which appends it.
    await api.post(`/api/conversations/${channel.id}/messages`, { content });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', minHeight: 0 }} className="scrollthin">
        {messages.length === 0 ? (
          <div style={{ color: theme.textMuted, padding: '8px 0' }}>This is the start of #{channel.name}. Say hi!</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ padding: '4px 0' }}>
              <span style={{ fontWeight: 600, color: theme.text }}>{m.authorName ?? 'unknown'}</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: theme.textMuted }}>{formatTime(m.createdAt)}</span>
              <div style={{ color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={{ flex: 'none', padding: '0 16px 16px', display: 'flex', gap: 8 }}>
        <input
          className="auth-input"
          style={{ flex: 1 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message #${channel.name}`}
          aria-label={`Message #${channel.name}`}
        />
        <button type="submit" style={{ background: theme.blurple, border: 'none', color: '#fff', borderRadius: 4, padding: '0 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </div>
  );
}
