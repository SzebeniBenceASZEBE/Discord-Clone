import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type { ServerEvent } from '@dc/shared';
import { openDatabase } from './db.ts';
import { authRoutes } from './auth/routes.ts';
import { csrfGuard } from './auth/guard.ts';
import { COOKIE_NAME, getSessionUser } from './auth/sessions.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const cookieSecure = process.env.NODE_ENV === 'production';

const db = openDatabase(DATA_DIR);

const app = Fastify({ logger: true });

// Plugins. Order: cookie parsing before anything that reads req.cookies.
await app.register(cookie);
await app.register(rateLimit, { global: false }); // opt-in per route
await app.register(websocket);

// CSRF check on every state-changing request.
app.addHook('onRequest', csrfGuard);

// Health check — used by Docker/Caddy to know the backend is up.
app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

// Auth: /api/auth/login, /logout, /me.
await app.register(authRoutes({ db, cookieSecure }));

// Realtime channel — now authenticated via the same session cookie.
app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, req) => {
    const user = getSessionUser(db, req.cookies[COOKIE_NAME]);
    if (!user) {
      socket.close(1008, 'unauthorized'); // 1008 = policy violation
      return;
    }
    const hello: ServerEvent = { type: 'hello', userId: user.id, serverTime: Date.now() };
    socket.send(JSON.stringify(hello));

    socket.on('message', (raw: Buffer) => {
      app.log.info({ from: user.id, raw: raw.toString() }, 'ws message received');
    });
  });
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  db.close();
  process.exit(1);
}
