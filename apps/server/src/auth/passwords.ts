import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt (built into Node — no native dependency).
 *
 * scrypt is a "memory-hard" hash: deliberately slow and RAM-hungry so that an
 * attacker who steals the database can't brute-force millions of guesses per
 * second. We store a random per-user `salt` alongside the `hash` so two people
 * with the same password still get different hashes.
 */

const KEYLEN = 64; // output hash length in bytes
const PARAMS = { N: 16384, r: 8, p: 1 }; // cost factors (tunable later)

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, PARAMS);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const hash = scryptSync(password, Buffer.from(salt, 'hex'), KEYLEN, PARAMS);
  const expected = Buffer.from(expectedHash, 'hex');
  // Compare in constant time so an attacker can't learn the hash byte-by-byte
  // from how long the comparison takes.
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
