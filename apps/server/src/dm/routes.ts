import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { OpenDmRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import type { Hub } from '../realtime/hub.ts';
import { listDmsForUser, listOtherUsers, openDm } from './store.ts';

export function dmRoutes(opts: { db: DatabaseSync; hub: Hub }) {
  const { db, hub } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/users — everyone else, so you can pick who to DM.
    app.get('/api/users', { preHandler: requireAuth }, async (req) => {
      return listOtherUsers(db, req.user!.id, hub);
    });

    // GET /api/dms — your existing DM conversations.
    app.get('/api/dms', { preHandler: requireAuth }, async (req) => {
      return listDmsForUser(db, req.user!.id, hub);
    });

    // POST /api/dms — open (or reuse) a DM with another user.
    app.post('/api/dms', { preHandler: requireAuth }, async (req, reply) => {
      const body = (req.body ?? {}) as Partial<OpenDmRequest>;
      const otherId = (body.userId ?? '').trim();
      if (!otherId || otherId === req.user!.id) return reply.code(400).send({ error: 'invalid user' });

      const other = db
        .prepare(`SELECT id, username, display_name AS displayName FROM users WHERE id = ?`)
        .get(otherId) as { id: string; username: string; displayName: string } | undefined;
      if (!other) return reply.code(404).send({ error: 'user not found' });

      const dm = openDm(db, req.user!.id, otherId);
      return reply.code(201).send({
        conversationId: dm.id,
        otherUser: { id: other.id, username: other.username, displayName: other.displayName, status: hub.isOnline(other.id) ? 'online' : 'offline' },
      });
    });
  };
}
