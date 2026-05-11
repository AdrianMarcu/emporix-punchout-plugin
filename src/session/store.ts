import Redis from 'ioredis';
import type { PunchoutSession } from './types';

const TOKEN_PREFIX = 'punchout:session:';
const ACTIVE_PREFIX = 'punchout:active:';

export class SessionStore {
  private redis: Redis;

  constructor(opts: { host: string; port: number }) {
    this.redis = new Redis({ host: opts.host, port: opts.port, lazyConnect: true });
  }

  async saveToken(token: string, sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${TOKEN_PREFIX}${token}`, sessionId, 'EX', ttlSeconds);
  }

  async consumeToken(token: string): Promise<string | null> {
    const key = `${TOKEN_PREFIX}${token}`;
    const results = await this.redis.multi().get(key).del(key).exec() as Array<[Error | null, unknown]>;
    if (!results || results.length < 2) return null;
    const [getErr, sessionId] = results[0];
    const [delErr] = results[1];
    if (getErr || delErr) return null;
    return (sessionId as string | null) ?? null;
  }

  async saveSession(session: PunchoutSession, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      `${ACTIVE_PREFIX}${session.sessionId}`,
      JSON.stringify(session),
      'EX',
      ttlSeconds,
    );
  }

  async getSession(sessionId: string): Promise<PunchoutSession | null> {
    const raw = await this.redis.get(`${ACTIVE_PREFIX}${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PunchoutSession;
  }

  async updateCartId(sessionId: string, cartId: string): Promise<boolean> {
    const key = `${ACTIVE_PREFIX}${sessionId}`;
    const [raw, ttl] = await this.redis.multi().get(key).ttl(key).exec() as Array<[Error | null, unknown]>;
    const sessionJson = raw[1] as string | null;
    if (!sessionJson) return false;
    const session = JSON.parse(sessionJson) as PunchoutSession;
    session.emporixCartId = cartId;
    const rawTtl = ttl[1] as number;
    const effectiveTtl = rawTtl > 0 ? rawTtl : (rawTtl === -1 ? null : 7200);
    if (effectiveTtl !== null) {
      await this.redis.set(key, JSON.stringify(session), 'EX', effectiveTtl);
    } else {
      await this.redis.set(key, JSON.stringify(session));
    }
    return true;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(`${ACTIVE_PREFIX}${sessionId}`);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
