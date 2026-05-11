import request from 'supertest';
import { app } from '../../src/index';
import { SessionStore } from '../../src/session/store';
import { config as appConfig } from '../../src/config';
import nock from 'nock';

describe('GET /session/:token', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(appConfig.redis);
  });

  afterEach(async () => {
    await store.disconnect();
    nock.cleanAll();
  });

  it('redirects to storefront on valid token', async () => {
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

    nock('https://api.emporix.io')
      .post(`/cart/${appConfig.emporix.tenantId}/carts`)
      .reply(201, { cartId: 'new-cart-001' });

    const res = await request(app).get('/session/valid-token-001');
    expect(res.status).toBe(302);
  });

  it('returns 410 for expired/missing token', async () => {
    const res = await request(app).get('/session/nonexistent-token');
    expect(res.status).toBe(410);
    expect(res.text).toContain('expired');
  });
});
