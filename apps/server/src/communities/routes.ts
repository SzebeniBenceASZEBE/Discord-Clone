import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { CreateChannelRequest, CreateCommunityRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import { createChannel, createCommunity, isMember, isOwner, listChannels, listCommunitiesForUser } from './store.ts';

interface CommunityOptions {
  db: DatabaseSync;
}

export function communityRoutes(opts: CommunityOptions) {
  const { db } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/communities — create a server (caller becomes owner).
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

    // POST /api/communities/:id/channels — owner only (for now).
    app.post('/api/communities/:id/channels', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isOwner(db, id, req.user!.id)) {
        return reply.code(403).send({ error: 'only the owner can add channels' });
      }
      const body = (req.body ?? {}) as Partial<CreateChannelRequest>;
      // Discord-style: lowercase, spaces become hyphens.
      const name = (body.name ?? '').trim().toLowerCase().replace(/\s+/g, '-');
      const kind = body.kind === 'voice' ? 'voice' : 'text';
      if (!/^[a-z0-9-]{1,30}$/.test(name)) {
        return reply.code(400).send({ error: 'channel name: a–z, 0–9, hyphen (1–30 chars)' });
      }
      return reply.code(201).send(createChannel(db, id, name, kind));
    });
  };
}
