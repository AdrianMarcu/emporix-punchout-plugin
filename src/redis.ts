import Redis from 'ioredis';
import { config } from './config';

// Railway provides REDIS_URL; fall back to host/port for local dev
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { lazyConnect: true })
  : new Redis({ host: config.redis.host, port: config.redis.port, lazyConnect: true });

export default redis;
