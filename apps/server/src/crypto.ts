import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * At-rest encryption for message/file content (the "encrypted blobs in SQLite"
 * from the architecture). Uses AES-256-GCM: GCM both encrypts AND produces an
 * authentication tag, so tampering with the stored bytes is detected on decrypt.
 *
 * The key is the server-managed MASTER_KEY (32 bytes, base64). It lives in .env,
 * never in the database — so a leaked DB file is just unreadable blobs.
 */

const TAG_BYTES = 16; // GCM auth tag length

function getKey(): Buffer {
  const b64 = process.env.MASTER_KEY;
  if (!b64) throw new Error('MASTER_KEY is not set — cannot encrypt/decrypt at rest');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEY must decode to 32 bytes (base64)');
  return key;
}

/** Encrypt plaintext. Returns a fresh random nonce + the ciphertext (with tag appended). */
export function encryptAtRest(plaintext: string): { nonce: string; ciphertext: string } {
  const iv = randomBytes(12); // 96-bit nonce, unique per message
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce: iv.toString('base64'), ciphertext: Buffer.concat([enc, tag]).toString('base64') };
}

/** Reverse of encryptAtRest. Throws if the data was tampered with. */
export function decryptAtRest(nonce: string, ciphertext: string): string {
  const iv = Buffer.from(nonce, 'base64');
  const data = Buffer.from(ciphertext, 'base64');
  const enc = data.subarray(0, data.length - TAG_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
