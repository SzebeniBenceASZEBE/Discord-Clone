import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { COOKIE_NAME, getSessionUser } from './sessions.ts';
import './types.ts'; // pull in the req.user augmentation

/**
 * Builds a preHandler that rejects the request with 401 unless it carries a
 * valid session cookie. On success it attaches the user to `req.user` so the
 * route handler knows who is calling.
 */
export function makeRequireAuth(db: DatabaseSync) {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = getSessionUser(db, req.cookies[COOKIE_NAME]);
    if (!user) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    req.user = user;
  };
}

/** Run after requireAuth: 403 unless the user is the admin (you). */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user?.isAdmin) {
    reply.code(403).send({ error: 'forbidden' });
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense layer. SameSite=Lax already stops a malicious site from making
 * the browser send our cookie on a cross-site POST. This adds a second check:
 * state-changing requests must carry a custom header that only our own
 * front-end sends — a value a plain cross-site form cannot set.
 */
export async function csrfGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (SAFE_METHODS.has(req.method)) return;
  if (req.headers['x-dc-web'] !== '1') {
    reply.code(403).send({ error: 'csrf' });
  }
}
