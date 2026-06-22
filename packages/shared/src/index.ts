/**
 * Types shared between the web client and the Node server.
 *
 * These describe the *plaintext* shapes the client works with. On the server,
 * message and file content is encrypted at rest (see trust model: server-managed
 * keys, encrypted blobs in SQLite). The wire/DB representation is defined where
 * persistence lives; this module is the contract both sides agree on.
 */

export type Id = string;
export type UnixMillis = number;

export interface User {
  id: Id;
  /** Login handle, unique. */
  username: string;
  /** Shown in the UI; may differ from username. */
  displayName: string;
  /** Optional avatar URL/asset id. */
  avatar?: string;
  status: PresenceStatus;
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

/** A "server" in Discord terms: a community of channels. */
export interface Community {
  id: Id;
  name: string;
  /** Short label shown on the 72px server rail (e.g. initials). */
  label: string;
  /** Rail icon background color. */
  color: string;
  ownerId: Id;
}

export type ChannelKind = 'text' | 'voice';

export interface Channel {
  id: Id;
  communityId: Id;
  kind: ChannelKind;
  name: string;
  /** Ordering within the community's channel list. */
  position: number;
}

/**
 * A chat message. `seq` is assigned by the server to give a total order within
 * a conversation (channel or DM); clients sort by it. `content` is plaintext
 * here — it is encrypted before it hits disk.
 */
export interface Message {
  id: Id;
  /** Channel id or DM conversation id. */
  conversationId: Id;
  authorId: Id;
  /** Author's display name at fetch time (denormalized for rendering). */
  authorName?: string;
  seq: number;
  content: string;
  attachments: AttachmentRef[];
  createdAt: UnixMillis;
  editedAt?: UnixMillis;
}

export interface AttachmentRef {
  id: Id;
  filename: string;
  mime: string;
  size: number;
}

/** A 1:1 private conversation between two users. */
export interface DirectConversation {
  id: Id;
  /** Exactly the two participant user ids. */
  participants: [Id, Id];
}

/** A user as shown in lists (people to DM, member lists). No secrets. */
export interface UserSummary {
  id: Id;
  username: string;
  displayName: string;
  status: PresenceStatus;
}

/** A DM in the sidebar: the conversation id plus the other person. */
export interface DmSummary {
  conversationId: Id;
  otherUser: UserSummary;
}

/** Body of POST /api/dms — open (or reuse) a DM with this user. */
export interface OpenDmRequest {
  userId: Id;
}

/** Realtime events fanned out over the WebSocket. */
export type ServerEvent =
  | { type: 'hello'; userId: Id; serverTime: UnixMillis }
  | { type: 'message.created'; message: Message }
  | { type: 'message.edited'; message: Message }
  | { type: 'presence'; userId: Id; status: PresenceStatus };

export type ClientEvent =
  | { type: 'subscribe'; conversationId: Id }
  | { type: 'unsubscribe'; conversationId: Id };

// --- Auth ---

/** The current user as returned by the auth endpoints. Contains no secrets. */
export interface AuthedUser {
  id: Id;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

/** Body of POST /api/auth/login. */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Body of POST /api/auth/register (joining via an invite link). */
export interface RegisterRequest {
  inviteToken: string;
  username: string;
  displayName: string;
  password: string;
}

/** Result of GET /api/invites/:token — is this link usable? */
export interface InviteInfo {
  valid: boolean;
  reason?: 'unknown' | 'used' | 'expired';
}

/** Returned to the admin when minting an invite (POST /api/invites). */
export interface CreatedInvite {
  token: string;
  url: string;
  expiresAt: UnixMillis | null;
}

/** Admin's view of an outstanding invite (GET /api/invites). No token. */
export interface InviteSummary {
  id: Id;
  createdAt: UnixMillis;
  expiresAt: UnixMillis | null;
  consumed: boolean;
}

// --- Communities & channels ---

/** Body of POST /api/communities. */
export interface CreateCommunityRequest {
  name: string;
}

/** Returned when a community is created (the server + its starter channel). */
export interface CreatedCommunity {
  community: Community;
  channels: Channel[];
}

/** Body of POST /api/communities/:id/channels. */
export interface CreateChannelRequest {
  name: string;
  kind: ChannelKind;
}

/** Returned when a member mints a per-server invite link. */
export interface CreatedServerInvite {
  token: string;
  url: string;
  expiresAt: UnixMillis | null;
}

/** Result of GET /api/server-invites/:token — can this link be used to join? */
export interface ServerInviteInfo {
  valid: boolean;
  reason?: 'unknown' | 'expired';
  communityName?: string;
  alreadyMember?: boolean;
}

/** Body of POST /api/conversations/:id/messages. */
export interface SendMessageRequest {
  content: string;
  /** Ids of files already uploaded to this conversation to attach. */
  attachmentIds?: Id[];
}
