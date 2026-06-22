import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Message } from '@dc/shared';
import { decryptAtRest, encryptAtRest } from '../crypto.ts';

/**
 * Data layer for chat messages. A message belongs to a "conversation" — either
 * a channel or a DM (the id is opaque here). Content is encrypted on the way in
 * and decrypted on the way out; the author's display name is joined in for the
 * UI.
 */

interface MessageRow {
  seq: number;
  id: string;
  authorId: string;
  authorName: string;
  nonce: string;
  ciphertext: string;
  createdAt: number;
  editedAt: number | null;
}

function rowToMessage(conversationId: string, r: MessageRow): Message {
  const message: Message = {
    id: r.id,
    conversationId,
    authorId: r.authorId,
    authorName: r.authorName,
    seq: r.seq,
    content: decryptAtRest(r.nonce, r.ciphertext),
    attachments: [],
    createdAt: r.createdAt,
  };
  if (r.editedAt != null) message.editedAt = r.editedAt;
  return message;
}

/** Store a message (encrypted) and return it with its server-assigned seq. */
export function sendMessage(db: DatabaseSync, conversationId: string, authorId: string, authorName: string, content: string): Message {
  const id = randomUUID();
  const now = Date.now();
  const { nonce, ciphertext } = encryptAtRest(content);
  const info = db
    .prepare(`INSERT INTO messages (id, conversation_id, author_id, nonce, ciphertext, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, conversationId, authorId, nonce, ciphertext, now);
  return {
    id,
    conversationId,
    authorId,
    authorName,
    seq: Number(info.lastInsertRowid),
    content,
    attachments: [],
    createdAt: now,
  };
}

/** Most recent messages in a conversation, oldest→newest. `before` pages back. */
export function listMessages(db: DatabaseSync, conversationId: string, limit: number, before?: number): Message[] {
  const cols = `m.seq, m.id, m.author_id AS authorId, u.display_name AS authorName, m.nonce, m.ciphertext, m.created_at AS createdAt, m.edited_at AS editedAt`;
  const rows = (
    before !== undefined
      ? db.prepare(`SELECT ${cols} FROM messages m JOIN users u ON u.id = m.author_id WHERE m.conversation_id = ? AND m.seq < ? ORDER BY m.seq DESC LIMIT ?`).all(conversationId, before, limit)
      : db.prepare(`SELECT ${cols} FROM messages m JOIN users u ON u.id = m.author_id WHERE m.conversation_id = ? ORDER BY m.seq DESC LIMIT ?`).all(conversationId, limit)
  ) as unknown as MessageRow[];
  return rows.reverse().map((r) => rowToMessage(conversationId, r));
}
