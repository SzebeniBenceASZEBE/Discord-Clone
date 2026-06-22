import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AuthedUser,
  CreatedInvite,
  InviteInfo,
  InviteSummary,
  LoginRequest,
  RegisterRequest,
} from '@dc/shared';
import { hashPassword, verifyPassword } from './passwords.ts';
import { COOKIE_NAME, SESSION_TTL_SECONDS, createSession, destroySession } from './sessions.ts';
import { createInvite, registerWithInvite, validateInvite } from './invites.ts';
import { makeRequireAuth, requireAdmin } from './guard.ts';

interface AuthOptions {
  db: DatabaseSync;
  /** Whether to mark the cookie Secure (true in production behind TLS). */
  cookieSecure: boolean;
  /** Public base URL of the web app, used to build invite links. */
  appUrl: string;
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
  const { db, cookieSecure, appUrl } = opts;
  const requireAuth = makeRequireAuth(db);
  const cookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };

  /** Issue a session for a user and attach the cookie to the response. */
  function startSession(req: FastifyRequest, reply: FastifyReply, userId: string): void {
    const { token } = createSession(db, userId, deviceLabel(req.headers['user-agent']));
    reply.setCookie(COOKIE_NAME, token, cookieOptions);
  }

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

        startSession(req, reply, user.id);
        const authed: AuthedUser = {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          isAdmin: user.isAdmin === 1,
        };
        return authed;
      },
    );

    // POST /api/auth/register — join via an invite link.
    app.post(
      '/api/auth/register',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const body = (req.body ?? {}) as Partial<RegisterRequest>;
        const inviteToken = (body.inviteToken ?? '').trim();
        const username = (body.username ?? '').trim().toLowerCase();
        const displayName = (body.displayName ?? '').trim();
        const password = body.password ?? '';

        if (!inviteToken || !username || !displayName || !password) {
          return reply.code(400).send({ error: 'all fields are required' });
        }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
          return reply.code(400).send({ error: 'username must be 3-20 chars: a-z, 0-9, underscore' });
        }
        if (password.length < 8) {
          return reply.code(400).send({ error: 'password must be at least 8 characters' });
        }

        const result = registerWithInvite(db, inviteToken, username, displayName, password);
        if (!result.ok) {
          const code = result.reason === 'username-taken' ? 409 : 410; // 410 Gone = bad/used invite
          return reply.code(code).send({ error: result.reason });
        }

        startSession(req, reply, result.userId);
        const authed: AuthedUser = { id: result.userId, username, displayName, isAdmin: false };
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

    // --- Invites (admin only, except public validation) ---

    // POST /api/invites — mint a single-use invite link.
    app.post('/api/invites', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
      const { token, expiresAt } = createInvite(db, req.user!.id);
      const out: CreatedInvite = { token, url: `${appUrl}/invite/${token}`, expiresAt };
      return reply.code(201).send(out);
    });

    // GET /api/invites/:token — public: is this link still usable?
    app.get('/api/invites/:token', async (req) => {
      const { token } = req.params as { token: string };
      const v = validateInvite(db, token);
      const info: InviteInfo = v.ok ? { valid: true } : { valid: false, reason: v.reason };
      return info;
    });

    // GET /api/invites — admin: list outstanding invites (no tokens exposed).
    app.get('/api/invites', { preHandler: [requireAuth, requireAdmin] }, async () => {
      const rows = db
        .prepare(`SELECT id, created_at AS createdAt, expires_at AS expiresAt, consumed_at AS consumedAt FROM invites ORDER BY created_at DESC`)
        .all() as { id: string; createdAt: number; expiresAt: number | null; consumedAt: number | null }[];
      return rows.map<InviteSummary>((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        consumed: r.consumedAt != null,
      }));
    });

    // DELETE /api/invites/:id — admin: revoke an unused invite.
    app.delete('/api/invites/:id', { preHandler: [requireAuth, requireAdmin] }, async (req) => {
      const { id } = req.params as { id: string };
      db.prepare(`DELETE FROM invites WHERE id = ? AND consumed_at IS NULL`).run(id);
      return { ok: true };
    });
  };
}
