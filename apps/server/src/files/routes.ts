import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { AttachmentRef } from '@dc/shared';
import { makeRequireAuth } from '../auth/guard.ts';
import { resolveAccess } from '../messages/access.ts';
import { createFileDecryptor, createFileEncryptor } from '../crypto.ts';
import { getAttachment, insertAttachment } from './store.ts';

export function fileRoutes(opts: { db: DatabaseSync; dataDir: string }) {
  const { db, dataDir } = opts;
  const filesDir = join(dataDir, 'files');
  mkdirSync(filesDir, { recursive: true });
  const requireAuth = makeRequireAuth(db);

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/conversations/:id/attachments — upload one file (multipart).
    app.post('/api/conversations/:id/attachments', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const access = resolveAccess(db, id, req.user!.id);
      if (!access.ok) return reply.code(access.reason === 'notfound' ? 404 : 403).send({ error: access.reason });

      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'no file provided' });

      const attId = randomUUID();
      const filePath = join(filesDir, attId);
      const { nonce, cipher } = createFileEncryptor();

      // Stream the upload through the encryptor to disk (never fully in memory).
      await pipeline(data.file, cipher, createWriteStream(filePath));

      if (data.file.truncated) {
        unlinkSync(filePath);
        return reply.code(413).send({ error: 'file exceeds the size limit' });
      }

      // GCM ciphertext length == plaintext length, so the on-disk size is it.
      const size = statSync(filePath).size;
      insertAttachment(db, {
        id: attId,
        conversationId: id,
        uploaderId: req.user!.id,
        filename: data.filename,
        mime: data.mimetype,
        size,
        nonce: nonce.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
      });

      const ref: AttachmentRef = { id: attId, filename: data.filename, mime: data.mimetype, size };
      return reply.code(201).send(ref);
    });

    // GET /api/attachments/:id — stream the decrypted file (images render inline).
    app.get('/api/attachments/:id', { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const att = getAttachment(db, id);
      if (!att) return reply.code(404).send({ error: 'not found' });

      const access = resolveAccess(db, att.conversationId, req.user!.id);
      if (!access.ok) return reply.code(403).send({ error: 'forbidden' });

      const decipher = createFileDecryptor(Buffer.from(att.nonce, 'base64'), Buffer.from(att.tag, 'base64'));
      reply.header('Content-Type', att.mime);
      reply.header('Content-Length', att.size);
      reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
      reply.header('Cache-Control', 'private, max-age=86400');
      return reply.send(createReadStream(join(filesDir, att.id)).pipe(decipher));
    });
  };
}
