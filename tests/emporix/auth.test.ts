import nock from 'nock';
import { TokenCache } from '../../src/emporix/auth';

const API_BASE = 'https://api.emporix.io';
const TENANT = 'test-tenant';

describe('TokenCache', () => {
  afterEach(() => nock.cleanAll());

  it('fetches a token on first call', async () => {
    nock(API_BASE)
      .post(`/customerlogin/auth/anonymous/token`)
      .reply(200, { access_token: 'tok-abc', expires_in: 3600, token_type: 'Bearer' });

    const cache = new TokenCache(API_BASE, TENANT, 'client-id', 'client-secret');
    const token = await cache.getToken();
    expect(token).toBe('tok-abc');
  });

  it('reuses cached token on second call', async () => {
    nock(API_BASE)
      .post(`/customerlogin/auth/anonymous/token`)
      .once()
      .reply(200, { access_token: 'tok-abc', expires_in: 3600, token_type: 'Bearer' });

    const cache = new TokenCache(API_BASE, TENANT, 'client-id', 'client-secret');
    await cache.getToken();
    const second = await cache.getToken();
    expect(second).toBe('tok-abc');
    expect(nock.pendingMocks()).toHaveLength(0);
  });

  it('throws on auth failure', async () => {
    nock(API_BASE)
      .post(`/customerlogin/auth/anonymous/token`)
      .reply(401, { error: 'invalid_client' });

    const cache = new TokenCache(API_BASE, TENANT, 'bad-id', 'bad-secret');
    await expect(cache.getToken()).rejects.toThrow('Emporix auth failed');
  });
});
