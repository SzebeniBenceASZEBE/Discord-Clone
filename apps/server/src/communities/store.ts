import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Channel, ChannelKind, Community, CommunityMember } from '@dc/shared';
import type { Hub } from '../realtime/hub.ts';

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
export function createCommunity(db: DatabaseSync, ownerId: string, name: string, opts: { isDefault?: boolean } = {}): { community: Community; channels: Channel[] } {
  const id = randomUUID();
  const now = Date.now();
  const label = deriveLabel(name);
  const color = pickColor(id);

  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO communities (id, name, label, color, owner_id, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, label, color, ownerId, opts.isDefault ? 1 : 0, now);
    db.prepare(`INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`)
      .run(id, ownerId, now);
    db.prepare(`INSERT INTO channels (id, community_id, kind, name, position, created_at) VALUES (?, ?, 'text', 'general', 0, ?)`)
      .run(randomUUID(), id, now);
    db.prepare(`INSERT INTO channels (id, community_id, kind, name, position, created_at) VALUES (?, ?, 'voice', 'voice', 1, ?)`)
      .run(randomUUID(), id, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { community: { id, name, label, color, ownerId, isDefault: opts.isDefault ?? false }, channels: listChannels(db, id) };
}

// SQLite has no boolean type, so is_default comes back as 0/1 — map it to a real
// boolean here so the rest of the app (and the shared type) sees a clean shape.
type CommunityRow = { id: string; name: string; label: string; color: string; ownerId: string; isDefault: number };
function toCommunity(r: CommunityRow): Community {
  return { id: r.id, name: r.name, label: r.label, color: r.color, ownerId: r.ownerId, isDefault: r.isDefault === 1 };
}

/** Communities the user belongs to (drives their server rail). */
export function listCommunitiesForUser(db: DatabaseSync, userId: string): Community[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.label, c.color, c.owner_id AS ownerId, c.is_default AS isDefault
       FROM communities c JOIN community_members m ON m.community_id = c.id
       WHERE m.user_id = ? ORDER BY c.created_at`,
    )
    .all(userId) as unknown as CommunityRow[];
  return rows.map(toCommunity);
}

export function getCommunity(db: DatabaseSync, communityId: string): Community | undefined {
  const row = db
    .prepare(`SELECT id, name, label, color, owner_id AS ownerId, is_default AS isDefault FROM communities WHERE id = ?`)
    .get(communityId) as CommunityRow | undefined;
  return row ? toCommunity(row) : undefined;
}

/** Everyone in a community, with live online status (for the member list). */
export function listMembers(db: DatabaseSync, communityId: string, hub: Hub): CommunityMember[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.display_name AS displayName, m.role
       FROM community_members m JOIN users u ON u.id = m.user_id
       WHERE m.community_id = ? ORDER BY u.display_name`,
    )
    .all(communityId) as unknown as { id: string; username: string; displayName: string; role: string }[];
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    role: r.role === 'owner' ? 'owner' : 'member',
    status: hub.isOnline(r.id) ? 'online' : 'offline',
  }));
}

/**
 * Ensures a default server exists and that every user is a member of it. Runs
 * on boot — idempotent. Default servers are the "everyone" rooms that need no
 * invite. If there are no users yet, does nothing (it'll seed on a later boot).
 */
export function ensureDefaults(db: DatabaseSync): void {
  const userCount = (db.prepare(`SELECT count(*) AS c FROM users`).get() as { c: number }).c;
  if (userCount === 0) return;

  const existing = db.prepare(`SELECT id FROM communities WHERE is_default = 1 LIMIT 1`).get();
  if (!existing) {
    const owner = db.prepare(`SELECT id FROM users ORDER BY created_at LIMIT 1`).get() as { id: string };
    createCommunity(db, owner.id, 'Main Hall', { isDefault: true });
  }

  db.prepare(
    `INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at)
     SELECT c.id, u.id, 'member', ? FROM communities c CROSS JOIN users u WHERE c.is_default = 1`,
  ).run(Date.now());
}

export function isMember(db: DatabaseSync, communityId: string, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?`).get(communityId, userId);
}

export function isOwner(db: DatabaseSync, communityId: string, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM communities WHERE id = ? AND owner_id = ?`).get(communityId, userId);
}

/** The auto-joined "everyone" server — protected from deletion. */
export function isDefaultCommunity(db: DatabaseSync, communityId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM communities WHERE id = ? AND is_default = 1`).get(communityId);
}

/**
 * Permanently delete a community and everything stored under it — channels,
 * members, invites (all via ON DELETE CASCADE), plus every message and
 * attachment row in its channels. Messages have no foreign key to channels
 * (a conversation id can point at a channel OR a DM), so they're deleted by
 * hand here. Returns the ids of attachment files the caller must remove from
 * disk; the DB rows are already gone. Everything runs in one transaction, so a
 * mid-way failure rolls back and leaves the server fully intact.
 */
export function deleteCommunity(db: DatabaseSync, communityId: string): { attachmentIds: string[] } {
  // A channel's id is also its conversation id for messages/attachments.
  const channelIds = (db.prepare(`SELECT id FROM channels WHERE community_id = ?`).all(communityId) as { id: string }[]).map((r) => r.id);

  // Collect attachment file ids up front (both sent and still-unsent uploads)
  // so we can unlink the encrypted blobs after the rows are gone.
  let attachmentIds: string[] = [];
  if (channelIds.length > 0) {
    const placeholders = channelIds.map(() => '?').join(',');
    attachmentIds = (db.prepare(`SELECT id FROM attachments WHERE conversation_id IN (${placeholders})`).all(...channelIds) as { id: string }[]).map((r) => r.id);
  }

  db.exec('BEGIN');
  try {
    if (channelIds.length > 0) {
      const placeholders = channelIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...channelIds);
      db.prepare(`DELETE FROM attachments WHERE conversation_id IN (${placeholders})`).run(...channelIds);
    }
    // Deleting the community row cascades to channels, members and invites.
    db.prepare(`DELETE FROM communities WHERE id = ?`).run(communityId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { attachmentIds };
}

/** Look up a single channel (used by the messaging layer to find its community). */
export function getChannel(db: DatabaseSync, channelId: string): Channel | undefined {
  return db
    .prepare(`SELECT id, community_id AS communityId, kind, name, position FROM channels WHERE id = ?`)
    .get(channelId) as Channel | undefined;
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
