import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { SendFriendRequest } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import type { Hub } from '../realtime/hub.ts';
import { acceptRequest, findUserByUsername, listFriendsData, removeFriend, removeRequest, sendRequest } from './store.ts';

export function friendRoutes(opts: { db: DatabaseSync; hub: Hub }) {
  const { db, hub } = opts;
  const requireAuth = makeRequireAuth(db);

  // Tell the other person their friends list changed, so their client refetches.
  const notify = (userId: string) => hub.sendToUser(userId, { type: 'friend.changed' });

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/friends — accepted friends + pending requests (both directions).
    app.get('/api/friends', { preHandler: requireAuth }, async (req) => {
      return listFriendsData(db, req.user!.id, hub);
    });

    // POST /api/friends/requests — befriend someone by username.
    app.post('/api/friends/requests', { preHandler: requireAuth }, async (req, reply) => {
      const body = (req.body ?? {}) as Partial<SendFriendRequest>;
      const username = (body.username ?? '').trim();
      if (!username) return reply.code(400).send({ error: 'username required' });

      const target = findUserByUsername(db, username);
      if (!target) return reply.code(404).send({ error: 'no user with that username' });

      const result = sendRequest(db, req.user!.id, target.id);
      if (!result.ok) {
        const message = result.reason === 'self' ? "you can't add yourself" : result.reason === 'already-friends' ? 'you are already friends' : 'request already sent';
        return reply.code(409).send({ error: message });
      }
      notify(target.id); // their incoming request (or new friendship) appears live
      return reply.code(201).send(listFriendsData(db, req.user!.id, hub));
    });

    // POST /api/friends/requests/:id/accept — accept an incoming request.
    app.post('/api/friends/requests/:id/accept', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = acceptRequest(db, req.user!.id, id);
      if (!result.ok) return reply.code(404).send({ error: 'request not found' });
      notify(result.otherId);
      return listFriendsData(db, req.user!.id, hub);
    });

    // DELETE /api/friends/requests/:id — decline (incoming) or cancel (outgoing).
    app.delete('/api/friends/requests/:id', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = removeRequest(db, req.user!.id, id);
      if (!result.ok) return reply.code(404).send({ error: 'request not found' });
      notify(result.otherId);
      return listFriendsData(db, req.user!.id, hub);
    });

    // DELETE /api/friends/:userId — remove an accepted friend.
    app.delete('/api/friends/:userId', { preHandler: requireAuth }, async (req, reply) => {
      const { userId } = req.params as { userId: string };
      if (!removeFriend(db, req.user!.id, userId)) return reply.code(404).send({ error: 'not friends' });
      notify(userId);
      return listFriendsData(db, req.user!.id, hub);
    });
  };
}
