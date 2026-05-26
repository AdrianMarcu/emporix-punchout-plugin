import Redis from 'ioredis';
import { config } from './config';

function createRedis(): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    // rediss:// = TLS required (Railway, Upstash, etc.)
    const tls = url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined;
    return new Redis(url, {
      tls,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
  }
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
}

const redis = createRedis();

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

export default redis;
