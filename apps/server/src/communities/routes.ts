import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { CreateCommunityRequest, CreatedCommunity, CreatedServerInvite, ServerInviteInfo } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import type { Hub } from '../realtime/hub.ts';
import { createCommunity, deleteCommunity, getCommunity, isDefaultCommunity, isMember, listChannels, listCommunitiesForUser, listMembers } from './store.ts';
import { acceptServerInvite, createServerInvite, validateServerInvite } from './invites.ts';

interface CommunityOptions {
  db: DatabaseSync;
  appUrl: string;
  hub: Hub;
  dataDir: string;
}

export function communityRoutes(opts: CommunityOptions) {
  const { db, appUrl, hub, dataDir } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/communities — create a server (caller becomes owner + member).
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

    // GET /api/communities/:id/members — the member list (online + offline).
    app.get('/api/communities/:id/members', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isMember(db, id, req.user!.id)) {
        return reply.code(403).send({ error: 'not a member of this server' });
      }
      return listMembers(db, id, hub);
    });

    // DELETE /api/communities/:id — permanently delete a server and its data.
    // Allowed for the server's owner or the admin (you); the default Main Hall
    // is protected. Removes messages, attachment rows + files, channels,
    // members and invites, then tells every client to drop it live.
    app.delete('/api/communities/:id', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const community = getCommunity(db, id);
      if (!community) return reply.code(404).send({ error: 'server not found' });
      if (isDefaultCommunity(db, id)) return reply.code(403).send({ error: 'the default server cannot be deleted' });
      if (community.ownerId !== req.user!.id && !req.user!.isAdmin) {
        return reply.code(403).send({ error: 'only the server owner or an admin can delete this server' });
      }

      const { attachmentIds } = deleteCommunity(db, id);
      // DB rows are gone; now remove the encrypted blobs from disk. Best-effort:
      // a missing file just means it was already cleaned up.
      for (const attId of attachmentIds) {
        try {
          unlinkSync(join(dataDir, 'files', attId));
        } catch {
          /* already gone */
        }
      }

      hub.broadcastAll({ type: 'community.deleted', communityId: id });
      return reply.code(204).send();
    });

    // POST /api/communities/:id/invites — any member can mint a join link.
    app.post('/api/communities/:id/invites', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!isMember(db, id, req.user!.id)) {
        return reply.code(403).send({ error: 'not a member of this server' });
      }
      const { token, expiresAt } = createServerInvite(db, id, req.user!.id);
      const out: CreatedServerInvite = { token, url: `${appUrl}/join/${token}`, expiresAt };
      return reply.code(201).send(out);
    });

    // GET /api/server-invites/:token — preview a join link (must be logged in).
    app.get('/api/server-invites/:token', { preHandler: requireAuth }, async (req) => {
      const { token } = req.params as { token: string };
      const result = validateServerInvite(db, token);
      if (!result.ok) return { valid: false, reason: result.reason } satisfies ServerInviteInfo;
      const community = getCommunity(db, result.communityId);
      const info: ServerInviteInfo = {
        valid: true,
        communityName: community?.name,
        alreadyMember: isMember(db, result.communityId, req.user!.id),
      };
      return info;
    });

    // POST /api/server-invites/:token/accept — join the server.
    app.post('/api/server-invites/:token/accept', { preHandler: requireAuth }, async (req, reply) => {
      const { token } = req.params as { token: string };
      const result = acceptServerInvite(db, token, req.user!.id);
      if (!result.ok) return reply.code(410).send({ error: result.reason });
      const community = getCommunity(db, result.communityId);
      if (!community) return reply.code(404).send({ error: 'server not found' });
      const out: CreatedCommunity = { community, channels: listChannels(db, result.communityId) };
      return reply.code(200).send(out);
    });
  };
}
