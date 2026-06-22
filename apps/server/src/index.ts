import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { ServerEvent } from '@dc/shared';
import { openDatabase } from './db.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = process.env.DATA_DIR ?? './data';

const db = openDatabase(DATA_DIR);

const app = Fastify({ logger: true });
await app.register(websocket);

// Health check — used by Docker/Caddy to know the backend is up.
app.get('/api/health', async () => ({ ok: true, time: Date.now() }));

// Realtime channel. For the scaffold this just greets the client and echoes
// nothing else; message fan-out is wired in the messaging phase.
app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket) => {
    const hello: ServerEvent = {
      type: 'hello',
      userId: 'anonymous',
      serverTime: Date.now(),
    };
    socket.send(JSON.stringify(hello));

    socket.on('message', (raw: Buffer) => {
      app.log.info({ raw: raw.toString() }, 'ws message received');
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
