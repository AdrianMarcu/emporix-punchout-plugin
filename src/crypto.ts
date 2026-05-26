import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_ROUNDS = 10;

export function encrypt(plaintext: string, key: string): string {
  if (Buffer.byteLength(key, 'utf8') !== 32) {
    throw new Error('AES key must be exactly 32 bytes');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(ciphertext: string, key: string): string {
  if (Buffer.byteLength(key, 'utf8') !== 32) {
    throw new Error('AES key must be exactly 32 bytes');
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  const [ivB64, authTagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  // Bcrypt hashes start with $2b$ — if the stored value is plaintext (e.g. seeded
  // from PUNCHOUT_SHARED_SECRET env var), fall back to direct comparison.
  if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
    return bcrypt.compare(secret, hash);
  }
  return secret === hash;
}
