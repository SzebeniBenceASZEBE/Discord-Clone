import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Opens (and lazily initializes) the SQLite database using Node's built-in
 * `node:sqlite` (synchronous API, no native build step — works the same on a
 * dev box and in the Linux container). This module owns the connection and the
 * schema bootstrap only. Schema grows per feature phase.
 */
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'app.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  bootstrap(db);
  return db;
}

function bootstrap(db: DatabaseSync): void {
  // Booleans are stored as INTEGER (0/1) and timestamps as INTEGER (ms since
  // epoch) — SQLite has no dedicated boolean/date type.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,   -- stored lowercased
      display_name  TEXT NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    -- One row per credential. 'password' today; 'webauthn' (passkeys) can be
    -- added later without touching the users table.
    CREATE TABLE IF NOT EXISTS credentials (
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind     TEXT NOT NULL,               -- 'password'
      salt     TEXT,                         -- scrypt salt (hex)
      hash     TEXT,                         -- scrypt hash (hex)
      PRIMARY KEY (user_id, kind)
    );

    -- The "coat-check ledger". One row per logged-in device. We store only the
    -- SHA-256 of the cookie token, never the token itself.
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      device_label  TEXT,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL
    );

    -- Single-use invite links (used in lesson 2). Again, only the token hash.
    CREATE TABLE IF NOT EXISTS invites (
      id           TEXT PRIMARY KEY,
      token_hash   TEXT NOT NULL UNIQUE,
      created_by   TEXT NOT NULL REFERENCES users(id),
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER,
      consumed_by  TEXT REFERENCES users(id),
      consumed_at  INTEGER
    );
  `);
}
