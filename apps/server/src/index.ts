import process from 'node:process';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type { ClientEvent, ServerEvent } from '@dc/shared';
import { openDatabase } from './db.ts';
import { authRoutes } from './auth/routes.ts';
import { communityRoutes } from './communities/routes.ts';
import { ensureDefaults } from './communities/store.ts';
import { messageRoutes } from './messages/routes.ts';
import { resolveAccess } from './messages/access.ts';
import { dmRoutes } from './dm/routes.ts';
import { fileRoutes } from './files/routes.ts';
import { Hub } from './realtime/hub.ts';
import { csrfGuard } from './auth/guard.ts';
import { COOKIE_NAME, getSessionUser } from './auth/sessions.ts';

// Load apps/server/.env (port, MASTER_KEY, …) when present. In production the
// real environment provides these, so a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on the ambient environment */
}

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const cookieSecure = process.env.NODE_ENV === 'production';

const db = openDatabase(DATA_DIR);
ensureDefaults(db); // seed/keep the default "everyone" server membership
const hub = new Hub();

const app = Fastify({ logger: true });

// Plugins. Order: cookie parsing before anything that reads req.cookies.
await app.register(cookie);
await app.register(rateLimit, { global: false }); // opt-in per route
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }); // 100 MB cap for now

// CSRF check on every state-changing request.
app.addHook('onRequest', csrfGuard);

// Health check — used by Docker/Caddy to know the backend is up.
app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

// Auth: /api/auth/login, /logout, /me.
await app.register(authRoutes({ db, cookieSecure, appUrl: APP_URL }));

// Communities + channels + server invites: /api/communities…
await app.register(communityRoutes({ db, appUrl: APP_URL }));

// Messages (channels + DMs): /api/conversations/:id/messages
await app.register(messageRoutes({ db, hub }));

// Direct messages: /api/users, /api/dms
await app.register(dmRoutes({ db, hub }));

// File attachments: upload to a conversation, download by id
await app.register(fileRoutes({ db, dataDir: DATA_DIR }));

if (!process.env.MASTER_KEY) {
  app.log.warn('MASTER_KEY is not set — sending/reading messages will fail until it is configured in .env');
}

// Realtime channel — authenticated via the session cookie. Clients subscribe to
// channels they belong to; the message route fans new messages out through the hub.
app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, req) => {
    const user = getSessionUser(db, req.cookies[COOKIE_NAME]);
    if (!user) {
      socket.close(1008, 'unauthorized'); // 1008 = policy violation
      return;
    }

    const conn = { userId: user.id, subs: new Set<string>(), send: (d: string) => socket.send(d) };
    const remove = hub.add(conn);

    const hello: ServerEvent = { type: 'hello', userId: user.id, serverTime: Date.now() };
    socket.send(JSON.stringify(hello));

    socket.on('message', (raw: Buffer) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(raw.toString()) as ClientEvent;
      } catch {
        return; // ignore malformed frames
      }
      if (event.type === 'subscribe') {
        // Only let a client watch a conversation it's allowed to access.
        if (resolveAccess(db, event.conversationId, user.id).ok) {
          conn.subs.add(event.conversationId);
        }
      } else if (event.type === 'unsubscribe') {
        conn.subs.delete(event.conversationId);
      }
    });

    socket.on('close', () => remove());
  });
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  db.close();
  process.exit(1);
}
