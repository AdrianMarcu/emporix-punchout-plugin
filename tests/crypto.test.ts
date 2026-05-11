import { encrypt, decrypt, hashSecret, verifySecret } from '../src/crypto';

const KEY = 'a'.repeat(32); // 32-byte key for AES-256

describe('encrypt/decrypt', () => {
  it('round-trips a plaintext string', () => {
    const cipher = encrypt('hello world', KEY);
    expect(decrypt(cipher, KEY)).toBe('hello world');
  });

  it('produces different ciphertext each call (unique IV)', () => {
    const a = encrypt('same', KEY);
    const b = encrypt('same', KEY);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encrypt('secret', KEY);
    const parts = cipher.split(':');
    parts[2] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(parts.join(':'), KEY)).toThrow();
  });
});

describe('hashSecret / verifySecret', () => {
  it('verifies a correct secret against its hash', async () => {
    const hash = await hashSecret('mysecret');
    expect(await verifySecret('mysecret', hash)).toBe(true);
  });

  it('rejects a wrong secret', async () => {
    const hash = await hashSecret('mysecret');
    expect(await verifySecret('wrong', hash)).toBe(false);
  });
});
