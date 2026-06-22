import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Message } from '@dc/shared';
import { decryptAtRest, encryptAtRest } from '../crypto.ts';

/**
 * Data layer for chat messages. Content is encrypted on the way in and
 * decrypted on the way out — callers (routes) only ever see plaintext.
 */

interface MessageRow {
  seq: number;
  id: string;
  authorId: string;
  nonce: string;
  ciphertext: string;
  createdAt: number;
  editedAt: number | null;
}

function rowToMessage(channelId: string, r: MessageRow): Message {
  const message: Message = {
    id: r.id,
    conversationId: channelId,
    authorId: r.authorId,
    seq: r.seq,
    content: decryptAtRest(r.nonce, r.ciphertext),
    attachments: [],
    createdAt: r.createdAt,
  };
  if (r.editedAt != null) message.editedAt = r.editedAt;
  return message;
}

/** Store a message (encrypted) and return it with its server-assigned seq. */
export function sendMessage(db: DatabaseSync, channelId: string, authorId: string, content: string): Message {
  const id = randomUUID();
  const now = Date.now();
  const { nonce, ciphertext } = encryptAtRest(content);
  const info = db
    .prepare(`INSERT INTO messages (id, channel_id, author_id, nonce, ciphertext, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, channelId, authorId, nonce, ciphertext, now);
  return {
    id,
    conversationId: channelId,
    authorId,
    seq: Number(info.lastInsertRowid),
    content,
    attachments: [],
    createdAt: now,
  };
}

/**
 * Most recent messages in a channel, returned oldest→newest. Pass `before` (a
 * seq) to page further back into history.
 */
export function listMessages(db: DatabaseSync, channelId: string, limit: number, before?: number): Message[] {
  const cols = `seq, id, author_id AS authorId, nonce, ciphertext, created_at AS createdAt, edited_at AS editedAt`;
  const rows = (
    before !== undefined
      ? db.prepare(`SELECT ${cols} FROM messages WHERE channel_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`).all(channelId, before, limit)
      : db.prepare(`SELECT ${cols} FROM messages WHERE channel_id = ? ORDER BY seq DESC LIMIT ?`).all(channelId, limit)
  ) as unknown as MessageRow[];
  return rows.reverse().map((r) => rowToMessage(channelId, r));
}
