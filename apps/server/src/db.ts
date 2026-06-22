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

    -- A "server" in Discord terms: a community of channels.
    CREATE TABLE IF NOT EXISTS communities (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      label       TEXT NOT NULL,   -- short initials shown on the rail
      color       TEXT NOT NULL,   -- rail icon color
      owner_id    TEXT NOT NULL REFERENCES users(id),
      created_at  INTEGER NOT NULL
    );

    -- Who belongs to which community (and their role within it).
    CREATE TABLE IF NOT EXISTS community_members (
      community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role          TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
      joined_at     INTEGER NOT NULL,
      PRIMARY KEY (community_id, user_id)
    );

    -- Text/voice channels inside a community.
    CREATE TABLE IF NOT EXISTS channels (
      id            TEXT PRIMARY KEY,
      community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL,   -- 'text' | 'voice'
      name          TEXT NOT NULL,
      position      INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_channels_community ON channels(community_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON community_members(user_id);

    -- Chat messages. 'seq' is an auto-incrementing integer giving a reliable
    -- global order; clients sort by it within a channel. Content is stored
    -- encrypted at rest (nonce + ciphertext) — never as plaintext.
    CREATE TABLE IF NOT EXISTS messages (
      seq         INTEGER PRIMARY KEY AUTOINCREMENT,
      id          TEXT NOT NULL UNIQUE,
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id   TEXT NOT NULL REFERENCES users(id),
      nonce       TEXT NOT NULL,
      ciphertext  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      edited_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, seq);
  `);
}
