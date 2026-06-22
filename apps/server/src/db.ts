import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Opens (and lazily initializes) the SQLite database using Node's built-in
 * `node:sqlite` (synchronous API, no native build step — works the same on a
 * dev box and in the Linux container). Messages and file blobs are stored
 * encrypted at rest; this module owns the connection and schema bootstrap only.
 * Schema is minimal for the scaffold and grows per feature phase.
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
