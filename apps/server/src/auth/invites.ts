import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './passwords.ts';

/**
 * Invite links: single-use "guest passes" the admin mints so new people can
 * join. Like sessions, we store only the SHA-256 of the token, never the token
 * itself — the raw token lives only in the link you send your friend.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // links expire after 7 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mint a new single-use invite. Returns the raw token for building the link. */
export function createInvite(db: DatabaseSync, createdBy: string): { token: string; expiresAt: number } {
  const token = randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + INVITE_TTL_MS;
  db.prepare(
    `INSERT INTO invites (id, token_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), hashToken(token), createdBy, now, expiresAt);
  return { token, expiresAt };
}

type InviteReason = 'unknown' | 'used' | 'expired';

interface InviteRow {
  id: string;
  expiresAt: number | null;
  consumedAt: number | null;
}

function findInvite(db: DatabaseSync, token: string): InviteRow | undefined {
  return db
    .prepare(`SELECT id, expires_at AS expiresAt, consumed_at AS consumedAt FROM invites WHERE token_hash = ?`)
    .get(hashToken(token)) as InviteRow | undefined;
}

/** Is this token a real, unused, unexpired invite? */
export function validateInvite(db: DatabaseSync, token: string): { ok: true } | { ok: false; reason: InviteReason } {
  const row = findInvite(db, token);
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.consumedAt != null) return { ok: false, reason: 'used' };
  if (row.expiresAt != null && row.expiresAt <= Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true };
}

export type RegisterOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid-invite' | 'username-taken' };

/**
 * Create the account and consume the invite as one atomic unit. If anything
 * fails, the transaction rolls back so we never end up with a consumed invite
 * but no user (or vice versa).
 */
export function registerWithInvite(
  db: DatabaseSync,
  token: string,
  username: string,
  displayName: string,
  password: string,
): RegisterOutcome {
  db.exec('BEGIN');
  try {
    // Re-check inside the transaction so two simultaneous registrations can't
    // both consume the same invite.
    const invite = findInvite(db, token);
    const expired = invite?.expiresAt != null && invite.expiresAt <= Date.now();
    if (!invite || invite.consumedAt != null || expired) {
      db.exec('ROLLBACK');
      return { ok: false, reason: 'invalid-invite' };
    }
    if (db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(username)) {
      db.exec('ROLLBACK');
      return { ok: false, reason: 'username-taken' };
    }

    const userId = randomUUID();
    const now = Date.now();
    const { salt, hash } = hashPassword(password);
    db.prepare(`INSERT INTO users (id, username, display_name, is_admin, created_at) VALUES (?, ?, ?, 0, ?)`)
      .run(userId, username, displayName, now);
    db.prepare(`INSERT INTO credentials (user_id, kind, salt, hash) VALUES (?, 'password', ?, ?)`)
      .run(userId, salt, hash);
    db.prepare(`UPDATE invites SET consumed_by = ?, consumed_at = ? WHERE id = ?`)
      .run(userId, now, invite.id);

    db.exec('COMMIT');
    return { ok: true, userId };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
