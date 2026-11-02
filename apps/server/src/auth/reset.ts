import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PasswordResetItem } from '@dc/shared';
import { hashPassword } from './passwords.ts';
import { destroyAllUserSessions } from './sessions.ts';

/**
 * Admin-mediated password reset. There's no email in this app, so recovery goes
 * through the admin: a user asks ('requested'), the admin hands out a one-time
 * code ('issued' — only its hash is stored), and using the code sets a new
 * password. Each user has at most one live reset row.
 */

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // a code is good for a day
// Unambiguous alphabet — no I/L/O/0/1, so a code is easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** An 8-char code, shown with a dash (ABCD-EFGH) but stored/compared without. */
function generateCode(): { display: string; normalized: string } {
  let raw = '';
  for (let i = 0; i < 8; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return { display: `${raw.slice(0, 4)}-${raw.slice(4)}`, normalized: raw };
}

/** Normalize user input so dashes/spaces/lowercase all match the stored hash. */
function normalizeCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function hashCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
}

function findUser(db: DatabaseSync, username: string): UserRow | undefined {
  return db
    .prepare(`SELECT id, username, display_name AS displayName FROM users WHERE username = ?`)
    .get(username.trim().toLowerCase()) as UserRow | undefined;
}

/** User asks for a reset. Returns the user id if they exist (for notifying). */
export function requestReset(db: DatabaseSync, username: string): string | null {
  const user = findUser(db, username);
  if (!user) return null;
  const existing = db.prepare(`SELECT status FROM password_resets WHERE user_id = ?`).get(user.id) as { status: string } | undefined;
  // Don't clobber a code the admin already issued; just (re)record the ask.
  if (!existing) {
    db.prepare(`INSERT INTO password_resets (id, user_id, status, requested_at) VALUES (?, ?, 'requested', ?)`).run(randomUUID(), user.id, Date.now());
  } else if (existing.status === 'requested') {
    db.prepare(`UPDATE password_resets SET requested_at = ? WHERE user_id = ?`).run(Date.now(), user.id);
  }
  return user.id;
}

/** Admin issues a one-time code for a username. Returns the code to pass on. */
export function issueCode(db: DatabaseSync, username: string): { ok: false } | { ok: true; code: string; expiresAt: number } {
  const user = findUser(db, username);
  if (!user) return { ok: false };
  const { display, normalized } = generateCode();
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MS;
  // Upsert: one live row per user (user_id is UNIQUE).
  db.prepare(
    `INSERT INTO password_resets (id, user_id, status, code_hash, issued_at, expires_at)
     VALUES (?, ?, 'issued', ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET status = 'issued', code_hash = excluded.code_hash, issued_at = excluded.issued_at, expires_at = excluded.expires_at`,
  ).run(randomUUID(), user.id, hashCode(normalized), now, expiresAt);
  return { ok: true, code: display, expiresAt };
}

/** The admin's pending list (both those who asked and those with a live code). */
export function listPending(db: DatabaseSync): PasswordResetItem[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.status, p.requested_at AS requestedAt, p.issued_at AS issuedAt, p.expires_at AS expiresAt,
              u.username, u.display_name AS displayName
       FROM password_resets p JOIN users u ON u.id = p.user_id
       ORDER BY COALESCE(p.issued_at, p.requested_at) DESC`,
    )
    .all() as unknown as PasswordResetItem[];
  return rows;
}

/** Use a code to set a new password. Clears the row + all of the user's sessions. */
export function completeReset(db: DatabaseSync, username: string, code: string, newPassword: string): { ok: true; userId: string } | { ok: false } {
  const user = findUser(db, username);
  if (!user) return { ok: false };
  const row = db
    .prepare(`SELECT code_hash AS codeHash, expires_at AS expiresAt FROM password_resets WHERE user_id = ? AND status = 'issued'`)
    .get(user.id) as { codeHash: string; expiresAt: number } | undefined;
  if (!row || !row.codeHash || row.expiresAt < Date.now()) return { ok: false };
  if (hashCode(normalizeCode(code)) !== row.codeHash) return { ok: false };

  const { salt, hash } = hashPassword(newPassword);
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE credentials SET salt = ?, hash = ? WHERE user_id = ? AND kind = 'password'`).run(salt, hash, user.id);
    db.prepare(`DELETE FROM password_resets WHERE user_id = ?`).run(user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  destroyAllUserSessions(db, user.id); // force re-login everywhere with the new password
  return { ok: true, userId: user.id };
}

/** Admin dismisses a reset entry (handled out-of-band, or spurious). */
export function dismissReset(db: DatabaseSync, id: string): void {
  db.prepare(`DELETE FROM password_resets WHERE id = ?`).run(id);
}

/** Ids of all admin users — who gets notified of a new reset request. */
export function adminIds(db: DatabaseSync): string[] {
  return (db.prepare(`SELECT id FROM users WHERE is_admin = 1`).all() as { id: string }[]).map((r) => r.id);
}
