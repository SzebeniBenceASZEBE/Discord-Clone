import type { DatabaseSync } from 'node:sqlite';
import type { AttachmentRef } from '@dc/shared';

/** Metadata layer for attachments. The bytes live on disk (handled by routes). */

export interface AttachmentMeta {
  id: string;
  conversationId: string;
  uploaderId: string;
  filename: string;
  mime: string;
  size: number;
  nonce: string; // base64
  tag: string; // base64 GCM auth tag
}

export function insertAttachment(db: DatabaseSync, m: AttachmentMeta): void {
  db.prepare(
    `INSERT INTO attachments (id, conversation_id, uploader_id, filename, mime, size, nonce, tag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(m.id, m.conversationId, m.uploaderId, m.filename, m.mime, m.size, m.nonce, m.tag, Date.now());
}

export interface StoredAttachment {
  id: string;
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  nonce: string;
  tag: string;
}

export function getAttachment(db: DatabaseSync, id: string): StoredAttachment | undefined {
  return db
    .prepare(`SELECT id, conversation_id AS conversationId, filename, mime, size, nonce, tag FROM attachments WHERE id = ?`)
    .get(id) as StoredAttachment | undefined;
}

/**
 * Link uploaded-but-unsent attachments to a message and return their refs. Only
 * links attachments that belong to the same conversation and aren't linked yet
 * (so you can't attach someone else's file to your message). Capped at 10.
 */
export function linkAttachments(db: DatabaseSync, ids: string[], conversationId: string, messageId: string): AttachmentRef[] {
  const select = db.prepare(`SELECT id, filename, mime, size FROM attachments WHERE id = ? AND conversation_id = ? AND message_id IS NULL`);
  const update = db.prepare(`UPDATE attachments SET message_id = ? WHERE id = ?`);
  const refs: AttachmentRef[] = [];
  for (const id of ids.slice(0, 10)) {
    const row = select.get(id, conversationId) as AttachmentRef | undefined;
    if (row) {
      update.run(messageId, id);
      refs.push(row);
    }
  }
  return refs;
}

/** Attachments for a set of messages, grouped by message id. */
export function getAttachmentsForMessages(db: DatabaseSync, messageIds: string[]): Map<string, AttachmentRef[]> {
  const map = new Map<string, AttachmentRef[]>();
  if (messageIds.length === 0) return map;
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, message_id AS messageId, filename, mime, size FROM attachments WHERE message_id IN (${placeholders})`)
    .all(...messageIds) as unknown as { id: string; messageId: string; filename: string; mime: string; size: number }[];
  for (const r of rows) {
    const arr = map.get(r.messageId) ?? [];
    arr.push({ id: r.id, filename: r.filename, mime: r.mime, size: r.size });
    map.set(r.messageId, arr);
  }
  return map;
}
