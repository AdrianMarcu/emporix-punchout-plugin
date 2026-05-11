export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  pluginHost: process.env.PLUGIN_HOST ?? 'http://localhost:3000',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  emporix: {
    apiBase: process.env.EMPORIX_API_BASE ?? 'https://api.emporix.io',
    tenantId: process.env.EMPORIX_TENANT_ID ?? '',
    jwksUri: process.env.EMPORIX_JWKS_URI ?? 'https://api.emporix.io/.well-known/jwks.json',
    clientId: process.env.EMPORIX_CLIENT_ID ?? '',
    clientSecret: process.env.EMPORIX_CLIENT_SECRET ?? '',
  },
  crypto: {
    aesKey: process.env.AES_KEY ?? '',
  },
  outboundTimeoutMs: parseInt(process.env.OUTBOUND_TIMEOUT_MS ?? '5000', 10),
  tokenTtlSeconds: 15 * 60,
  sessionTtlSeconds: 2 * 60 * 60,
};
