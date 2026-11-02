import type { ServerEvent } from '@dc/shared';

/**
 * In-memory registry of live WebSocket connections and which channels each is
 * watching. When a message is posted, the message route asks the hub to push it
 * to every connection subscribed to that channel.
 *
 * In-memory is fine here: it's a single server process for a small group, and a
 * dropped connection just re-subscribes when it reconnects. (If we ever run
 * multiple server instances, this becomes a shared pub/sub instead.)
 */
export interface Connection {
  userId: string;
  /** Channel ids this connection is currently watching. */
  subs: Set<string>;
  send: (data: string) => void;
}

export class Hub {
  private connections = new Set<Connection>();

  /** Register a connection; returns a function to remove it on disconnect. */
  add(conn: Connection): () => void {
    this.connections.add(conn);
    return () => {
      this.connections.delete(conn);
    };
  }

  /** Is this user connected right now (on any device)? Used for presence. */
  isOnline(userId: string): boolean {
    for (const conn of this.connections) {
      if (conn.userId === userId) return true;
    }
    return false;
  }

  /** Push an event to every connection watching `channelId`. */
  broadcast(channelId: string, event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const conn of this.connections) {
      if (!conn.subs.has(channelId)) continue;
      try {
        conn.send(data);
      } catch {
        // Socket already gone; its close handler will remove it.
      }
    }
  }

  /**
   * Push an event to every live connection, regardless of what they're
   * watching. For app-wide news like a server being deleted, which isn't tied
   * to a single channel subscription.
   */
  broadcastAll(event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const conn of this.connections) {
      try {
        conn.send(data);
      } catch {
        // Socket already gone; its close handler will remove it.
      }
    }
  }
}
