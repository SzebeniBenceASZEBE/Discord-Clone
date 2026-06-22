import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Channel, ChannelKind, Community } from '@dc/shared';

/**
 * Data layer for communities ("servers") and their channels. Pure functions
 * over the database — the HTTP layer (routes.ts) handles auth and validation.
 */

const RAIL_COLORS = ['#5865f2', '#23a55a', '#eb459e', '#f0b232', '#3ba55c', '#9b59b6', '#e67e22'];

/** "Game Night" -> "GN"; "Friends" -> "FR". Shown on the 72px server rail. */
function deriveLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '??';
}

/** Deterministic color so a community always gets the same rail color. */
function pickColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RAIL_COLORS[h % RAIL_COLORS.length]!;
}

/**
 * Create a community, make the creator its owner+member, and give it a default
 * "general" text channel — all in one transaction.
 */
export function createCommunity(db: DatabaseSync, ownerId: string, name: string): { community: Community; channels: Channel[] } {
  const id = randomUUID();
  const now = Date.now();
  const label = deriveLabel(name);
  const color = pickColor(id);

  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO communities (id, name, label, color, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, name, label, color, ownerId, now);
    db.prepare(`INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`)
      .run(id, ownerId, now);
    db.prepare(`INSERT INTO channels (id, community_id, kind, name, position, created_at) VALUES (?, ?, 'text', 'general', 0, ?)`)
      .run(randomUUID(), id, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { community: { id, name, label, color, ownerId }, channels: listChannels(db, id) };
}

/** Communities the user belongs to (drives their server rail). */
export function listCommunitiesForUser(db: DatabaseSync, userId: string): Community[] {
  return db
    .prepare(
      `SELECT c.id, c.name, c.label, c.color, c.owner_id AS ownerId
       FROM communities c JOIN community_members m ON m.community_id = c.id
       WHERE m.user_id = ? ORDER BY c.created_at`,
    )
    .all(userId) as unknown as Community[];
}

export function isMember(db: DatabaseSync, communityId: string, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?`).get(communityId, userId);
}

export function isOwner(db: DatabaseSync, communityId: string, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM communities WHERE id = ? AND owner_id = ?`).get(communityId, userId);
}

export function listChannels(db: DatabaseSync, communityId: string): Channel[] {
  return db
    .prepare(`SELECT id, community_id AS communityId, kind, name, position FROM channels WHERE community_id = ? ORDER BY position, created_at`)
    .all(communityId) as unknown as Channel[];
}

export function createChannel(db: DatabaseSync, communityId: string, name: string, kind: ChannelKind): Channel {
  const id = randomUUID();
  const now = Date.now();
  const position = (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM channels WHERE community_id = ?`).get(communityId) as { p: number }).p;
  db.prepare(`INSERT INTO channels (id, community_id, kind, name, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, communityId, kind, name, position, now);
  return { id, communityId, kind, name, position };
}
