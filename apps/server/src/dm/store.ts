import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { DmSummary } from '@dc/shared';
import type { Hub } from '../realtime/hub.ts';

/**
 * Data layer for 1:1 direct messages. A DM is a conversation between two users;
 * we store the pair sorted (lo/hi) so "A↔B" and "B↔A" map to one row.
 */

interface DmRow {
  id: string;
  userLo: string;
  userHi: string;
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Look up a DM conversation by id (used by the message access resolver). */
export function getDm(db: DatabaseSync, conversationId: string): DmRow | undefined {
  return db
    .prepare(`SELECT id, user_lo AS userLo, user_hi AS userHi FROM dm_conversations WHERE id = ?`)
    .get(conversationId) as DmRow | undefined;
}

export function isParticipant(dm: DmRow, userId: string): boolean {
  return dm.userLo === userId || dm.userHi === userId;
}

/** Open the DM between two users, creating it if it doesn't exist yet. */
export function openDm(db: DatabaseSync, a: string, b: string): { id: string } {
  if (a === b) throw new Error('cannot DM yourself');
  const [lo, hi] = sortPair(a, b);
  const existing = db.prepare(`SELECT id FROM dm_conversations WHERE user_lo = ? AND user_hi = ?`).get(lo, hi) as { id: string } | undefined;
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(`INSERT INTO dm_conversations (id, user_lo, user_hi, created_at) VALUES (?, ?, ?, ?)`).run(id, lo, hi, Date.now());
  return { id };
}

/** The DM conversations this user is part of, with the other participant. */
export function listDmsForUser(db: DatabaseSync, selfId: string, hub: Hub): DmSummary[] {
  const rows = db
    .prepare(
      `SELECT d.id AS conversationId,
              u.id AS otherId, u.username AS otherUsername, u.display_name AS otherDisplayName
       FROM dm_conversations d
       JOIN users u ON u.id = CASE WHEN d.user_lo = ? THEN d.user_hi ELSE d.user_lo END
       WHERE d.user_lo = ? OR d.user_hi = ?
       ORDER BY d.created_at DESC`,
    )
    .all(selfId, selfId, selfId) as unknown as { conversationId: string; otherId: string; otherUsername: string; otherDisplayName: string }[];
  return rows.map((r) => ({
    conversationId: r.conversationId,
    otherUser: { id: r.otherId, username: r.otherUsername, displayName: r.otherDisplayName, status: hub.isOnline(r.otherId) ? 'online' : 'offline' },
  }));
}
