import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Per-server invite links: a member of a server mints a link that lets other
 * logged-in users join *that* server. Reusable until it expires. Like every
 * other token, only its hash is stored.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createServerInvite(db: DatabaseSync, communityId: string, createdBy: string): { token: string; expiresAt: number } {
  const token = randomBytes(18).toString('base64url');
  const now = Date.now();
  const expiresAt = now + INVITE_TTL_MS;
  db.prepare(`INSERT INTO server_invites (id, community_id, token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), communityId, hashToken(token), createdBy, now, expiresAt);
  return { token, expiresAt };
}

interface ServerInviteRow {
  communityId: string;
  expiresAt: number | null;
}

type ValidResult = { ok: true; communityId: string } | { ok: false; reason: 'unknown' | 'expired' };

export function validateServerInvite(db: DatabaseSync, token: string): ValidResult {
  const row = db
    .prepare(`SELECT community_id AS communityId, expires_at AS expiresAt FROM server_invites WHERE token_hash = ?`)
    .get(hashToken(token)) as ServerInviteRow | undefined;
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.expiresAt != null && row.expiresAt <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, communityId: row.communityId };
}

/** Join the user to the server the token points at. Idempotent if already in. */
export function acceptServerInvite(db: DatabaseSync, token: string, userId: string): ValidResult {
  const result = validateServerInvite(db, token);
  if (!result.ok) return result;
  db.prepare(`INSERT OR IGNORE INTO community_members (community_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`)
    .run(result.communityId, userId, Date.now());
  return result;
}
