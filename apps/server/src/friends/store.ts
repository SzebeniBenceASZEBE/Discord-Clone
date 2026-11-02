import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FriendRelation, FriendRequest, FriendsData, UserSummary } from '@dc/shared';
import type { Hub } from '../realtime/hub.ts';

/**
 * Data layer for friendships. One row per relationship (not per direction):
 * `requester_id` asked `addressee_id`, and `status` moves 'pending' ->
 * 'accepted'. A unique index on the ordered pair keeps A↔B single.
 *
 * DMs are gated on an accepted friendship (see dm/routes.ts), which is the
 * whole point: in a small group, not everyone should be able to DM everyone.
 */

interface FriendshipRow {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  createdAt: number;
}

/** The single relationship row between two users, in either direction. */
function getPair(db: DatabaseSync, a: string, b: string): FriendshipRow | undefined {
  return db
    .prepare(
      `SELECT id, requester_id AS requesterId, addressee_id AS addresseeId, status, created_at AS createdAt
       FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(a, b, b, a) as FriendshipRow | undefined;
}

export function areFriends(db: DatabaseSync, a: string, b: string): boolean {
  const row = getPair(db, a, b);
  return !!row && row.status === 'accepted';
}

/** How `selfId` relates to `otherId` — drives which button the UI shows. */
export function relationshipTo(db: DatabaseSync, selfId: string, otherId: string): FriendRelation {
  if (selfId === otherId) return 'self';
  const row = getPair(db, selfId, otherId);
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friend';
  return row.requesterId === selfId ? 'outgoing' : 'incoming';
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
}

function toSummary(u: UserRow, hub: Hub): UserSummary {
  return { id: u.id, username: u.username, displayName: u.displayName, status: hub.isOnline(u.id) ? 'online' : 'offline' };
}

export function findUserByUsername(db: DatabaseSync, username: string): UserRow | undefined {
  return db
    .prepare(`SELECT id, username, display_name AS displayName FROM users WHERE username = ?`)
    .get(username.trim().toLowerCase()) as UserRow | undefined;
}

export type SendResult =
  | { ok: true; becameFriends: boolean }
  | { ok: false; reason: 'self' | 'already-friends' | 'already-sent' };

/**
 * Send a friend request from `selfId` to `targetId`. If the target had already
 * sent *you* a request, this accepts it instead (mutual intent = friends). The
 * caller handles the "user not found" case before calling this.
 */
export function sendRequest(db: DatabaseSync, selfId: string, targetId: string): SendResult {
  if (selfId === targetId) return { ok: false, reason: 'self' };
  const existing = getPair(db, selfId, targetId);
  if (existing) {
    if (existing.status === 'accepted') return { ok: false, reason: 'already-friends' };
    // A pending row exists. If they asked us first, accepting closes the loop.
    if (existing.addresseeId === selfId) {
      db.prepare(`UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?`).run(Date.now(), existing.id);
      return { ok: true, becameFriends: true };
    }
    return { ok: false, reason: 'already-sent' }; // we already asked them
  }
  db.prepare(`INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)`)
    .run(randomUUID(), selfId, targetId, Date.now());
  return { ok: true, becameFriends: false };
}

/** Accept a pending request addressed to `selfId`. Returns the other user id. */
export function acceptRequest(db: DatabaseSync, selfId: string, requestId: string): { ok: true; otherId: string } | { ok: false } {
  const row = db
    .prepare(`SELECT requester_id AS requesterId, addressee_id AS addresseeId, status FROM friendships WHERE id = ?`)
    .get(requestId) as { requesterId: string; addresseeId: string; status: string } | undefined;
  if (!row || row.status !== 'pending' || row.addresseeId !== selfId) return { ok: false };
  db.prepare(`UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?`).run(Date.now(), requestId);
  return { ok: true, otherId: row.requesterId };
}

/**
 * Delete a pending request by id — decline (if addressed to you) or cancel (if
 * you sent it). Returns the other party so we can notify them.
 */
export function removeRequest(db: DatabaseSync, selfId: string, requestId: string): { ok: true; otherId: string } | { ok: false } {
  const row = db
    .prepare(`SELECT requester_id AS requesterId, addressee_id AS addresseeId, status FROM friendships WHERE id = ?`)
    .get(requestId) as { requesterId: string; addresseeId: string; status: string } | undefined;
  if (!row || row.status !== 'pending') return { ok: false };
  if (row.requesterId !== selfId && row.addresseeId !== selfId) return { ok: false };
  db.prepare(`DELETE FROM friendships WHERE id = ?`).run(requestId);
  return { ok: true, otherId: row.requesterId === selfId ? row.addresseeId : row.requesterId };
}

/** Remove an accepted friend by their user id. Returns whether a row was removed. */
export function removeFriend(db: DatabaseSync, selfId: string, otherId: string): boolean {
  const row = getPair(db, selfId, otherId);
  if (!row || row.status !== 'accepted') return false;
  db.prepare(`DELETE FROM friendships WHERE id = ?`).run(row.id);
  return true;
}

/** Everything the home screen needs: accepted friends + pending both ways. */
export function listFriendsData(db: DatabaseSync, selfId: string, hub: Hub): FriendsData {
  const rows = db
    .prepare(
      `SELECT f.id AS fid, f.status, f.created_at AS createdAt, f.requester_id AS requesterId,
              u.id, u.username, u.display_name AS displayName
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE f.requester_id = ? OR f.addressee_id = ?
       ORDER BY u.display_name`,
    )
    .all(selfId, selfId, selfId) as unknown as (UserRow & { fid: string; status: string; createdAt: number; requesterId: string })[];

  const friends: UserSummary[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];
  for (const r of rows) {
    const user = toSummary({ id: r.id, username: r.username, displayName: r.displayName }, hub);
    if (r.status === 'accepted') {
      friends.push(user);
    } else {
      const req: FriendRequest = { id: r.fid, user, direction: r.requesterId === selfId ? 'outgoing' : 'incoming', createdAt: r.createdAt };
      (req.direction === 'incoming' ? incoming : outgoing).push(req);
    }
  }
  return { friends, incoming, outgoing };
}
