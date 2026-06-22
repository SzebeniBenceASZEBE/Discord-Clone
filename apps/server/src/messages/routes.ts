import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { SendMessageRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import type { Hub } from '../realtime/hub.ts';
import { resolveAccess } from './access.ts';
import { listMessages, sendMessage } from './store.ts';
import { linkAttachments } from '../files/store.ts';

const MAX_LENGTH = 4000;

export function messageRoutes(opts: { db: DatabaseSync; hub: Hub }) {
  const { db, hub } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/conversations/:id/messages — post to a channel or a DM.
    app.post('/api/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = resolveAccess(db, id, req.user!.id);
      if (!access.ok) return reply.code(access.reason === 'notfound' ? 404 : 403).send({ error: access.reason });
      if (access.kind === 'channel' && access.channel.kind !== 'text') {
        return reply.code(400).send({ error: 'messages can only be sent to text channels' });
      }

      const body = (req.body ?? {}) as Partial<SendMessageRequest>;
      const content = (body.content ?? '').trim();
      const attachmentIds = Array.isArray(body.attachmentIds)
        ? body.attachmentIds.filter((x): x is string => typeof x === 'string')
        : [];
      if (!content && attachmentIds.length === 0) return reply.code(400).send({ error: 'message is empty' });
      if (content.length > MAX_LENGTH) return reply.code(400).send({ error: `message too long (max ${MAX_LENGTH})` });

      const message = sendMessage(db, id, req.user!.id, req.user!.displayName, req.user!.username, content);
      if (attachmentIds.length) message.attachments = linkAttachments(db, attachmentIds, id, message.id);
      hub.broadcast(id, { type: 'message.created', message });
      return reply.code(201).send(message);
    });

    // GET /api/conversations/:id/messages?limit=50&before=<seq> — history.
    app.get('/api/conversations/:id/messages', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = resolveAccess(db, id, req.user!.id);
      if (!access.ok) return reply.code(access.reason === 'notfound' ? 404 : 403).send({ error: access.reason });

      const q = req.query as { limit?: string; before?: string };
      const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
      const before = q.before ? Number(q.before) : undefined;
      return listMessages(db, id, limit, before);
    });
  };
}
