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
  migrate(db);
  return db;
}

/**
 * Non-destructive schema upgrades for databases created by older versions.
 * CREATE TABLE IF NOT EXISTS can't add a column to an existing table, so column
 * additions go here, guarded so they run at most once.
 */
function migrate(db: DatabaseSync): void {
  const communityCols = db.prepare(`PRAGMA table_info(communities)`).all() as { name: string }[];
  if (!communityCols.some((c) => c.name === 'is_default')) {
    db.exec(`ALTER TABLE communities ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
  }
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
      is_default  INTEGER NOT NULL DEFAULT 0,  -- everyone is auto-joined to defaults
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

    -- Per-server invite links (reusable until they expire). Only the hash is
    -- stored; the raw token lives only in the link.
    CREATE TABLE IF NOT EXISTS server_invites (
      id            TEXT PRIMARY KEY,
      community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      token_hash    TEXT NOT NULL UNIQUE,
      created_by    TEXT NOT NULL REFERENCES users(id),
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER
    );

    -- A "conversation" is either a channel or a 1:1 DM. DMs between a pair of
    -- users; user_lo/user_hi are the two ids sorted, so each pair has one row.
    CREATE TABLE IF NOT EXISTS dm_conversations (
      id          TEXT PRIMARY KEY,
      user_lo     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_hi     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL,
      UNIQUE (user_lo, user_hi)
    );

    -- Chat messages. 'seq' is an auto-incrementing integer giving a reliable
    -- global order; clients sort by it. 'conversation_id' is a channel id OR a
    -- DM conversation id (no FK, since it can point at either table). Content is
    -- stored encrypted at rest (nonce + ciphertext) — never as plaintext.
    CREATE TABLE IF NOT EXISTS messages (
      seq             INTEGER PRIMARY KEY AUTOINCREMENT,
      id              TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      author_id       TEXT NOT NULL REFERENCES users(id),
      nonce           TEXT NOT NULL,
      ciphertext      TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      edited_at       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, seq);

    -- File attachments. The bytes live encrypted on disk (DATA_DIR/files/<id>);
    -- this table holds metadata + the per-file nonce and GCM auth tag needed to
    -- decrypt. message_id is NULL between upload and the message being sent.
    CREATE TABLE IF NOT EXISTS attachments (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      message_id       TEXT REFERENCES messages(id) ON DELETE CASCADE,
      uploader_id      TEXT NOT NULL REFERENCES users(id),
      filename         TEXT NOT NULL,
      mime             TEXT NOT NULL,
      size             INTEGER NOT NULL,
      nonce            TEXT NOT NULL,
      tag              TEXT NOT NULL,
      created_at       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

    -- Friendships. One row per relationship (not per direction): requester_id
    -- asked addressee_id. status goes 'pending' -> 'accepted'. We keep the pair
    -- ordered in the UNIQUE index below so A↔B can't exist twice.
    CREATE TABLE IF NOT EXISTS friendships (
      id            TEXT PRIMARY KEY,
      requester_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status        TEXT NOT NULL,   -- 'pending' | 'accepted'
      created_at    INTEGER NOT NULL,
      responded_at  INTEGER
    );

    -- Enforce one relationship per unordered pair: least(a,b) + greatest(a,b)
    -- is unique regardless of who sent the request.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
      ON friendships(MIN(requester_id, addressee_id), MAX(requester_id, addressee_id));
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);

    -- In-app server invites: a member invites a specific user to a server. The
    -- invitee sees it as a pending invite (like a friend request) and accepts to
    -- join. One pending invite per (server, invitee).
    CREATE TABLE IF NOT EXISTS server_member_invites (
      id            TEXT PRIMARY KEY,
      community_id  TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      inviter_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    INTEGER NOT NULL,
      UNIQUE (community_id, invitee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_invites_invitee ON server_member_invites(invitee_id);

    -- Admin-mediated password resets. A user asks (status 'requested'); the
    -- admin hands out a one-time code (status 'issued', only its hash stored);
    -- using the code sets a new password and the row is deleted. At most one
    -- live row per user. No email exists in this app, so the admin is the
    -- recovery channel.
    CREATE TABLE IF NOT EXISTS password_resets (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      status        TEXT NOT NULL,   -- 'requested' | 'issued'
      code_hash     TEXT,            -- SHA-256 of the one-time code (when issued)
      requested_at  INTEGER,
      issued_at     INTEGER,
      expires_at    INTEGER
    );
  `);
}
