import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { SendMessageRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import { getChannel, isMember } from '../communities/store.ts';
import { listMessages, sendMessage } from './store.ts';

const MAX_LENGTH = 4000;

export function messageRoutes(opts: { db: DatabaseSync }) {
  const { db } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/channels/:channelId/messages — post a message to a text channel.
    app.post('/api/channels/:channelId/messages', { preHandler: requireAuth }, async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const channel = getChannel(db, channelId);
      if (!channel) return reply.code(404).send({ error: 'channel not found' });
      if (!isMember(db, channel.communityId, req.user!.id)) return reply.code(403).send({ error: 'not a member' });
      if (channel.kind !== 'text') return reply.code(400).send({ error: 'messages can only be sent to text channels' });

      const body = (req.body ?? {}) as Partial<SendMessageRequest>;
      const content = (body.content ?? '').trim();
      if (!content) return reply.code(400).send({ error: 'message is empty' });
      if (content.length > MAX_LENGTH) return reply.code(400).send({ error: `message too long (max ${MAX_LENGTH})` });

      return reply.code(201).send(sendMessage(db, channelId, req.user!.id, content));
    });

    // GET /api/channels/:channelId/messages?limit=50&before=<seq> — history.
    app.get('/api/channels/:channelId/messages', { preHandler: requireAuth }, async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const channel = getChannel(db, channelId);
      if (!channel) return reply.code(404).send({ error: 'channel not found' });
      if (!isMember(db, channel.communityId, req.user!.id)) return reply.code(403).send({ error: 'not a member' });

      const q = req.query as { limit?: string; before?: string };
      const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
      const before = q.before ? Number(q.before) : undefined;
      return listMessages(db, channelId, limit, before);
    });
  };
}
