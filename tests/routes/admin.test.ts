import request from 'supertest';
import { app } from '../../src/index';
import * as configStore from '../../src/admin/configStore';

jest.mock('../../src/admin/configStore');

// Mock jsonwebtoken so we can control jwt.verify behaviour per test
jest.mock('jsonwebtoken', () => {
  const actual = jest.requireActual<typeof import('jsonwebtoken')>('jsonwebtoken');
  return { ...actual, verify: jest.fn() };
});

import jwt from 'jsonwebtoken';

describe('Admin routes', () => {
  it('returns 401 on GET /admin/config without token', async () => {
    const res = await request(app).get('/admin/config');
    expect(res.status).toBe(401);
  });

  it('returns 401 on POST /admin/config without token', async () => {
    const res = await request(app).post('/admin/config').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 on GET /admin/buyers without token', async () => {
    const res = await request(app).get('/admin/buyers');
    expect(res.status).toBe(401);
  });
});

describe('Admin routes — authenticated', () => {
  const MOCK_CONFIG = {
    sharedSecretHash: '$2b$10$hash',
    serviceAccount: { clientId: 'cid', clientSecret: 'cs' },
    storefrontBaseUrl: 'https://store.example.com',
    cxmlEnabled: true,
    ociEnabled: true,
    operationAllowed: 'edit' as const,
    ociOkCode: 'ADDFROMCATALOG' as const,
    buyerMappings: [{ buyerOrgId: 'org-1', customerGroupId: 'cg-1' }],
  };

  beforeEach(() => {
    // Make jwt.verify call its callback with a valid decoded payload
    (jwt.verify as jest.Mock).mockImplementation((_token: unknown, _key: unknown, _opts: unknown, cb: Function) => {
      cb(null, { tenantId: 'test-tenant' });
    });
    (configStore.getConfig as jest.Mock).mockResolvedValue(MOCK_CONFIG);
    (configStore.saveConfig as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('GET /admin/config returns config without sharedSecretHash and with masked clientSecret', async () => {
    const res = await request(app)
      .get('/admin/config')
      .set('Authorization', 'Bearer test-jwt');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('sharedSecretHash');
    expect(res.body.serviceAccount.clientSecret).toBe('***');
    expect(res.body.cxmlEnabled).toBe(true);
  });

  it('GET /admin/config returns {} when config is missing', async () => {
    (configStore.getConfig as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .get('/admin/config')
      .set('Authorization', 'Bearer test-jwt');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('POST /admin/config returns { ok: true }', async () => {
    const res = await request(app)
      .post('/admin/config')
      .set('Authorization', 'Bearer test-jwt')
      .send({ storefrontBaseUrl: 'https://store.example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /admin/buyers returns buyer mappings', async () => {
    const res = await request(app)
      .get('/admin/buyers')
      .set('Authorization', 'Bearer test-jwt');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ buyerOrgId: 'org-1', customerGroupId: 'cg-1' }]);
  });

  it('POST /admin/buyers upserts a new buyer mapping', async () => {
    const res = await request(app)
      .post('/admin/buyers')
      .set('Authorization', 'Bearer test-jwt')
      .send({ buyerOrgId: 'org-2', customerGroupId: 'cg-2' });
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({ buyerOrgId: 'org-2', customerGroupId: 'cg-2' });
  });

  it('POST /admin/buyers returns 404 when config is missing', async () => {
    (configStore.getConfig as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post('/admin/buyers')
      .set('Authorization', 'Bearer test-jwt')
      .send({ buyerOrgId: 'x', customerGroupId: 'y' });
    expect(res.status).toBe(404);
  });
});
