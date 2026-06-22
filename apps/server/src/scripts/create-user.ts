import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { openDatabase } from '../db.ts';
import { hashPassword } from '../auth/passwords.ts';

/**
 * One-time bootstrap: creates the first admin account (you). After this you
 * invite everyone else, so there is no public sign-up.
 *
 *   npm run create-user -- <username> "<display name>"
 *
 * The password is read from the terminal without echoing. For non-interactive
 * use you may instead set DC_PASSWORD in the environment.
 */

const DATA_DIR = process.env.DATA_DIR ?? './data';

// Control characters we watch for while reading a hidden line. Built via
// fromCharCode so no raw control bytes live in this source file.
const CR = '\r';
const LF = '\n';
const EOT = String.fromCharCode(4); // Ctrl-D (end of input)
const ETX = String.fromCharCode(3); // Ctrl-C (interrupt)
const DEL = String.fromCharCode(127); // delete
const BS = '\b'; // backspace

/** Reads a line from the terminal without printing the typed characters. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    let value = '';
    const isTTY = Boolean(stdin.isTTY);
    if (isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === LF || ch === CR || ch === EOT) {
          if (isTTY) stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdin.pause();
          process.stdout.write('\n');
          resolve(value);
          return;
        } else if (ch === ETX) {
          process.exit(1);
        } else if (ch === DEL || ch === BS) {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let username = process.argv[2] ?? (await rl.question('username: '));
  username = username.trim().toLowerCase();

  let displayName = process.argv.slice(3).join(' ').trim();
  if (!displayName) displayName = (await rl.question('display name: ')).trim();
  rl.close();

  const password = process.env.DC_PASSWORD ?? (await readHidden('password: '));

  if (!username || !displayName || !password) {
    console.error('username, display name and password are all required');
    process.exit(1);
  }

  const db = openDatabase(DATA_DIR);
  const exists = db.prepare(`SELECT 1 FROM users WHERE username = ?`).get(username);
  if (exists) {
    console.error(`user "${username}" already exists`);
    process.exit(1);
  }

  const id = randomUUID();
  const { salt, hash } = hashPassword(password);
  db.prepare(`INSERT INTO users (id, username, display_name, is_admin, created_at) VALUES (?, ?, ?, 1, ?)`)
    .run(id, username, displayName, Date.now());
  db.prepare(`INSERT INTO credentials (user_id, kind, salt, hash) VALUES (?, 'password', ?, ?)`)
    .run(id, salt, hash);
  db.close();

  console.log(`Created admin user "${username}" (${displayName}).`);
}

main();
