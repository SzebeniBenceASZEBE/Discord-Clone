import type { DatabaseSync } from 'node:sqlite';
import type { Channel } from '@dc/shared';
import { getChannel, isMember } from '../communities/store.ts';
import { getDm, isParticipant } from '../dm/store.ts';

/**
 * Resolves whether a user may read/write a conversation, and what kind it is.
 * A conversation is a channel (access = community membership) or a DM (access =
 * being one of the two participants).
 */
export type Access =
  | { ok: true; kind: 'channel'; channel: Channel }
  | { ok: true; kind: 'dm' }
  | { ok: false; reason: 'notfound' | 'forbidden' };

export function resolveAccess(db: DatabaseSync, conversationId: string, userId: string): Access {
  const channel = getChannel(db, conversationId);
  if (channel) {
    return isMember(db, channel.communityId, userId) ? { ok: true, kind: 'channel', channel } : { ok: false, reason: 'forbidden' };
  }
  const dm = getDm(db, conversationId);
  if (dm) {
    return isParticipant(dm, userId) ? { ok: true, kind: 'dm' } : { ok: false, reason: 'forbidden' };
  }
  return { ok: false, reason: 'notfound' };
}
