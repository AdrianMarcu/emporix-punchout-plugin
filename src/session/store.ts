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
    const results = await this.redis.multi().get(key).del(key).exec() as Array<[Error | null, any]>;
    if (!results || results.length === 0) return null;
    const [error, sessionId] = results[0];
    if (error) return null;
    return sessionId ?? null;
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

  async updateCartId(sessionId: string, cartId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    const ttl = await this.redis.ttl(`${ACTIVE_PREFIX}${sessionId}`);
    session.emporixCartId = cartId;
    await this.redis.set(`${ACTIVE_PREFIX}${sessionId}`, JSON.stringify(session), 'EX', ttl > 0 ? ttl : 7200);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.redis.del(`${ACTIVE_PREFIX}${sessionId}`);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
