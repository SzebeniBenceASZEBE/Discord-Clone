import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { VoiceTokenResponse } from '@dc/shared';
import { AccessToken } from 'livekit-server-sdk';
import { makeRequireAuth } from '../auth/guard.ts';
import { getChannel, isMember } from '../communities/store.ts';

interface VoiceOptions {
  db: DatabaseSync;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * The "bouncer" for voice. The home server holds the LiveKit API secret and
 * mints a short-lived signed token that lets a specific user join a specific
 * room (= a voice channel). The browser takes this token to LiveKit. LiveKit
 * trusts the token because it's signed with the shared secret — it never has to
 * call back to us. A voice channel's room name is just the channel id.
 */
export function voiceRoutes(opts: VoiceOptions) {
  const { db, livekitUrl, apiKey, apiSecret } = opts;
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    app.post('/api/channels/:channelId/voice-token', { preHandler: requireAuth }, async (req, reply) => {
      const { channelId } = req.params as { channelId: string };
      const channel = getChannel(db, channelId);
      if (!channel) return reply.code(404).send({ error: 'channel not found' });
      if (channel.kind !== 'voice') return reply.code(400).send({ error: 'not a voice channel' });
      if (!isMember(db, channel.communityId, req.user!.id)) return reply.code(403).send({ error: 'not a member' });

      const at = new AccessToken(apiKey, apiSecret, {
        identity: req.user!.id, // who you are in the room
        name: req.user!.displayName, // shown to others
        ttl: '1h',
      });
      at.addGrant({ roomJoin: true, room: channelId, canPublish: true, canSubscribe: true });

      const token = await at.toJwt();
      const out: VoiceTokenResponse = { url: livekitUrl, token };
      return reply.send(out);
    });
  };
}
