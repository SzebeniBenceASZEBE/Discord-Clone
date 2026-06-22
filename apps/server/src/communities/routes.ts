import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { CreateCommunityRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import { createCommunity, isMember, listChannels, listCommunitiesForUser } from './store.ts';

interface CommunityOptions {
  db: DatabaseSync;
}

export function communityRoutes(opts: CommunityOptions) {
  const { db } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/communities — create a server (caller becomes owner + member).
    // Anyone logged in can do this — no admin needed. Two channels (one text,
    // one voice) are created automatically; we don't manage channels beyond that.
    app.post('/api/communities', { preHandler: requireAuth }, async (req, reply) => {
      const body = (req.body ?? {}) as Partial<CreateCommunityRequest>;
      const name = (body.name ?? '').trim();
      if (name.length < 2 || name.length > 50) {
        return reply.code(400).send({ error: 'name must be 2–50 characters' });
      }
      return reply.code(201).send(createCommunity(db, req.user!.id, name));
    });

    // GET /api/communities — the servers the caller belongs to.
    app.get('/api/communities', { preHandler: requireAuth }, async (req) => {
      return listCommunitiesForUser(db, req.user!.id);
    });

    // GET /api/communities/:id/channels — members only.
    app.get('/api/communities/:id/channels', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isMember(db, id, req.user!.id)) {
        return reply.code(403).send({ error: 'not a member of this server' });
      }
      return listChannels(db, id);
    });
  };
}
