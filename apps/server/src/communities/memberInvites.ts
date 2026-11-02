import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PendingServerInvite } from '@dc/shared';

/**
 * In-app server invites: a member invites a specific user, who sees it as a
 * pending invite (like a friend request) and accepts to join. One pending
 * invite per (server, invitee).
 */

export function isMember(db: DatabaseSync, communityId: string, userId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ?`).get(communityId, userId);
}

export type InviteResult = { ok: true; created: boolean } | { ok: false; reason: 'already-member' };

/** Invite a user to a server. No-op (still ok) if they're already invited. */
export function inviteMember(db: DatabaseSync, communityId: string, inviterId: string, inviteeId: string): InviteResult {
  if (isMember(db, communityId, inviteeId)) return { ok: false, reason: 'already-member' };
  const existing = db.prepare(`SELECT 1 FROM server_member_invites WHERE community_id = ? AND invitee_id = ?`).get(communityId, inviteeId);
  if (existing) return { ok: true, created: false };
  db.prepare(`INSERT INTO server_member_invites (id, community_id, inviter_id, invitee_id, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), communityId, inviterId, inviteeId, Date.now());
  return { ok: true, created: true };
}

/** The pending server invites addressed to this user. */
export function listPendingInvites(db: DatabaseSync, inviteeId: string): PendingServerInvite[] {
  return db
    .prepare(
      `SELECT i.id, i.created_at AS createdAt,
              c.id AS communityId, c.name AS communityName, c.label AS communityLabel, c.color AS communityColor,
              u.display_name AS inviterName
       FROM server_member_invites i
       JOIN communities c ON c.id = i.community_id
       JOIN users u ON u.id = i.inviter_id
       WHERE i.invitee_id = ? ORDER BY i.created_at DESC`,
    )
    .all(inviteeId) as unknown as PendingServerInvite[];
}

/** Accept an invite: join the server and clear the invite. Returns the server id. */
export function acceptMemberInvite(db: DatabaseSync, inviteId: string, userId: string): { ok: true; communityId: string } | { ok: false } {
  const row = db
    .prepare(`SELECT community_id AS communityId, invitee_id AS inviteeId FROM server_member_invites WHERE id = ?`)
    .get(inviteId) as { communityId: string; inviteeId: string } | undefined;
  if (!row || row.inviteeId !== userId) return { ok: false };
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`)
      .run(row.communityId, userId, Date.now());
    db.prepare(`DELETE FROM server_member_invites WHERE id = ?`).run(inviteId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, communityId: row.communityId };
}

/** Decline (or cancel) an invite — only the invitee can. */
export function declineMemberInvite(db: DatabaseSync, inviteId: string, userId: string): boolean {
  const row = db.prepare(`SELECT invitee_id AS inviteeId FROM server_member_invites WHERE id = ?`).get(inviteId) as { inviteeId: string } | undefined;
  if (!row || row.inviteeId !== userId) return false;
  db.prepare(`DELETE FROM server_member_invites WHERE id = ?`).run(inviteId);
  return true;
}
