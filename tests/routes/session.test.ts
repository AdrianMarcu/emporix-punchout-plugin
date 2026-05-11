import request from 'supertest';
import { app } from '../../src/index';
import { SessionStore } from '../../src/session/store';
import { config as appConfig } from '../../src/config';
import nock from 'nock';
import * as configStore from '../../src/admin/configStore';
import * as auth from '../../src/emporix/auth';

jest.mock('../../src/admin/configStore');
jest.mock('../../src/emporix/auth');

describe('GET /session/:token', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(appConfig.redis);

    // Mock getConfig to return a valid config
    (configStore.getConfig as jest.Mock).mockResolvedValue({
      sharedSecretHash: '$2b$10$hash',
      serviceAccount: { clientId: 'client-id', clientSecret: 'client-secret' },
      storefrontBaseUrl: 'https://store.example.com',
      cxmlEnabled: true,
      ociEnabled: true,
      operationAllowed: 'edit' as const,
      ociOkCode: 'ADDFROMCATALOG' as const,
      buyerMappings: [],
    });

    // Mock TokenCache.getToken
    const mockGetToken = jest.fn().mockResolvedValue('mock-access-token');
    (auth.TokenCache as jest.Mock).mockImplementation(() => ({ getToken: mockGetToken }));
  });

  afterEach(async () => {
    await store.disconnect();
    nock.cleanAll();
    jest.clearAllMocks();
  });

  it('redirects to storefront with cartId on valid token', async () => {
    const sessionId = 'sess-redirect-test';
    await store.saveSession({
      sessionId,
      protocol: 'cxml',
      buyerOrgId: 'buyer-1',
      customerGroupId: 'cg-1',
      browserFormPostUrl: 'https://buyer.example.com/return',
      buyerCookie: 'cookie-1',
      emporixCartId: null,
      createdAt: new Date().toISOString(),
    }, 7200);
    await store.saveToken('valid-token-001', sessionId, 900);

    nock(appConfig.emporix.apiBase)
      .post(`/cart/${appConfig.emporix.tenantId}/carts`)
      .reply(201, { cartId: 'new-cart-001' });

    const res = await request(app).get('/session/valid-token-001');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('new-cart-001');
  });

  it('returns 410 for expired/missing token', async () => {
    const res = await request(app).get('/session/nonexistent-token');
    expect(res.status).toBe(410);
    expect(res.text).toContain('expired');
  });
});
