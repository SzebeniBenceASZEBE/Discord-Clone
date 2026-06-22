import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ClientEvent, Message, ServerEvent } from '@dc/shared';

/**
 * Owns the single WebSocket for the logged-in session. Components don't open
 * their own sockets — they ask this provider to `subscribe` to a channel and
 * register a handler via `onMessageCreated`. On reconnect, it re-subscribes to
 * whatever was being watched, so a dropped connection self-heals.
 */
type MessageHandler = (message: Message) => void;

interface SocketApi {
  connected: boolean;
  subscribe: (channelId: string) => void;
  unsubscribe: (channelId: string) => void;
  onMessageCreated: (handler: MessageHandler) => () => void;
}

const SocketCtx = createContext<SocketApi | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const subscriptions = useRef<Set<string>>(new Set());
  const handlers = useRef<Set<MessageHandler>>(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Re-watch everything we were watching before a reconnect.
        for (const id of subscriptions.current) {
          ws.send(JSON.stringify({ type: 'subscribe', conversationId: id } satisfies ClientEvent));
        }
      };
      ws.onmessage = (ev) => {
        const event = JSON.parse(ev.data) as ServerEvent;
        if (event.type === 'message.created') {
          for (const handler of handlers.current) handler(event.message);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) retry = setTimeout(connect, 1000); // auto-reconnect
      };
    }

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const subscribe = useCallback((channelId: string) => {
    subscriptions.current.add(channelId);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', conversationId: channelId } satisfies ClientEvent));
    }
  }, []);

  const unsubscribe = useCallback((channelId: string) => {
    subscriptions.current.delete(channelId);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', conversationId: channelId } satisfies ClientEvent));
    }
  }, []);

  const onMessageCreated = useCallback((handler: MessageHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  return <SocketCtx.Provider value={{ connected, subscribe, unsubscribe, onMessageCreated }}>{children}</SocketCtx.Provider>;
}

export function useSocket(): SocketApi {
  const ctx = useContext(SocketCtx);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx;
}
