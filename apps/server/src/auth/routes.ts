import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthedUser, LoginRequest } from '@dc/shared';
import { hashPassword, verifyPassword } from './passwords.ts';
import { COOKIE_NAME, SESSION_TTL_SECONDS, createSession, destroySession } from './sessions.ts';
import { makeRequireAuth } from './guard.ts';

interface AuthOptions {
  db: DatabaseSync;
  /** Whether to mark the cookie Secure (true in production behind TLS). */
  cookieSecure: boolean;
}

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  isAdmin: number;
}
interface CredRow {
  salt: string;
  hash: string;
}

// A throwaway hash computed once at startup. When a login names a user that
// doesn't exist, we still run a verify against this so a missing user takes the
// same time as a wrong password — otherwise response timing would leak which
// usernames are real.
const DUMMY = hashPassword('password-that-is-never-correct');

/** Crude device label from the User-Agent, just for the sessions list. */
function deviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Firefox/.test(userAgent) ? 'Firefox'
    : /Edg/.test(userAgent) ? 'Edge'
    : /Chrome/.test(userAgent) ? 'Chrome'
    : /Safari/.test(userAgent) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS/.test(userAgent) ? 'macOS'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'device';
  return `${browser} on ${os}`;
}

export function authRoutes(opts: AuthOptions) {
  const { db, cookieSecure } = opts;
  const requireAuth = makeRequireAuth(db);
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/auth/login — check the password, issue a session cookie.
    app.post(
      '/api/auth/login',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const body = (req.body ?? {}) as Partial<LoginRequest>;
        const username = (body.username ?? '').trim().toLowerCase();
        const password = body.password ?? '';
        if (!username || !password) {
          return reply.code(400).send({ error: 'username and password are required' });
        }

        const user = db
          .prepare(`SELECT id, username, display_name AS displayName, is_admin AS isAdmin FROM users WHERE username = ?`)
          .get(username) as UserRow | undefined;
        const cred = user
          ? (db.prepare(`SELECT salt, hash FROM credentials WHERE user_id = ? AND kind = 'password'`).get(user.id) as CredRow | undefined)
          : undefined;

        // Always run a verify (real or dummy) for constant-ish timing.
        const ok = cred
          ? verifyPassword(password, cred.salt, cred.hash)
          : (verifyPassword(password, DUMMY.salt, DUMMY.hash), false);

        if (!user || !cred || !ok) {
          return reply.code(401).send({ error: 'invalid username or password' });
        }

        const { token } = createSession(db, user.id, deviceLabel(req.headers['user-agent']));
        reply.setCookie(COOKIE_NAME, token, cookieOptions);

        const authed: AuthedUser = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          isAdmin: user.isAdmin === 1,
        };
        return authed;
      },
    );

    // POST /api/auth/logout — tear up this device's ticket.
    app.post('/api/auth/logout', async (req, reply) => {
      destroySession(db, req.cookies[COOKIE_NAME]);
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return { ok: true };
    });

    // GET /api/auth/me — who am I? (guarded; 401 if not logged in.)
    app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
      return req.user;
    });
  };
}
