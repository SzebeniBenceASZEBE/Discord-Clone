import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthedUser } from '@dc/shared';

/** Name of the cookie that carries the session ticket. */
export const COOKIE_NAME = 'dc_session';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const REFRESH_AFTER_MS = 60 * 60 * 1000; // extend the session at most hourly

/** The ticket lives in the cookie as plaintext; only its hash is stored. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Issues a new ticket for a user/device and records it in the ledger. */
export function createSession(db: DatabaseSync, userId: string, deviceLabel: string | null): { token: string } {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, device_label, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, hashToken(token), deviceLabel, now, now, now + SESSION_TTL_MS);
  return { token };
}

interface SessionRow {
  sid: string;
  lastSeen: number;
  expiresAt: number;
  id: string;
  username: string;
  displayName: string;
  isAdmin: number;
}

/**
 * Looks up the ticket. Returns the user if the session is valid (and slides the
 * expiry forward), or null if the ticket is missing/unknown/expired.
 */
export function getSessionUser(db: DatabaseSync, token: string | undefined): AuthedUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.id AS sid, s.last_seen_at AS lastSeen, s.expires_at AS expiresAt,
              u.id AS id, u.username AS username, u.display_name AS displayName, u.is_admin AS isAdmin
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as SessionRow | undefined;

  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt <= now) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(row.sid);
    return null;
  }

  // Sliding expiry, throttled so we don't write to the DB on every request.
  if (now - row.lastSeen > REFRESH_AFTER_MS) {
    db.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .run(now, now + SESSION_TTL_MS, row.sid);
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isAdmin: row.isAdmin === 1,
  };
}

/** Tears one ticket out of the ledger (logout). */
export function destroySession(db: DatabaseSync, token: string | undefined): void {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}

/** Tears out every ticket for a user (used by "remove member" later). */
export function destroyAllUserSessions(db: DatabaseSync, userId: string): void {
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}
