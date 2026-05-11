import request from 'supertest';
import nock from 'nock';
import { app } from '../../src/index';
import { config as appConfig } from '../../src/config';
import { hashSecret } from '../../src/crypto';
import * as configStore from '../../src/admin/configStore';
import * as auth from '../../src/emporix/auth';

jest.mock('../../src/admin/configStore');
jest.mock('../../src/emporix/auth');

const TENANT = appConfig.emporix.tenantId;
const API_BASE = appConfig.emporix.apiBase;

const SETUP_XML = (sharedSecret: string) => `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="integration-test-1" timestamp="2026-05-11T10:00:00Z">
  <Header>
    <From><Credential domain="NetworkId"><Identity>buyer-org-integration</Identity></Credential></From>
    <To><Credential domain="NetworkId"><Identity>supplier</Identity></Credential></To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>buyer-org-integration</Identity>
        <SharedSecret>${sharedSecret}</SharedSecret>
      </Credential>
      <UserAgent>IntegrationTest</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>integration-cookie-001</BuyerCookie>
      <BrowserFormPost><URL>https://buyer.example.com/cxml/return</URL></BrowserFormPost>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

describe('Full cXML punchout flow', () => {
  const SHARED_SECRET = 'integration-test-secret';

  beforeAll(async () => {
    const hash = await hashSecret(SHARED_SECRET);
    (configStore.getConfig as jest.Mock).mockResolvedValue({
      sharedSecretHash: hash,
      serviceAccount: { clientId: 'test-client', clientSecret: 'test-secret' },
      storefrontBaseUrl: 'https://store.example.com',
      cxmlEnabled: true,
      ociEnabled: true,
      operationAllowed: 'edit' as const,
      ociOkCode: 'ADDFROMCATALOG' as const,
      buyerMappings: [{ buyerOrgId: 'buyer-org-integration', customerGroupId: 'cg-premium' }],
    });

    const mockGetToken = jest.fn().mockResolvedValue('mock-access-token');
    (auth.TokenCache as jest.Mock).mockImplementation(() => ({ getToken: mockGetToken }));
  });

  afterEach(() => nock.cleanAll());

  it('Step 1: POST /punchout/cxml/setup returns StartPage URL', async () => {
    const res = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send(SETUP_XML(SHARED_SECRET));

    expect(res.status).toBe(200);
    expect(res.text).toContain('PunchOutSetupResponse');
    expect(res.text).toContain('/session/');
  });

  it('Step 2: GET /session/:token creates cart and redirects to storefront', async () => {
    nock(API_BASE)
      .post(`/cart/${TENANT}/carts`)
      .reply(201, { cartId: 'cart-int-001' });

    const setupRes = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send(SETUP_XML(SHARED_SECRET));

    const tokenMatch = setupRes.text.match(/\/session\/([a-f0-9-]+)/);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch![1];

    const sessionRes = await request(app).get(`/session/${token}`);
    expect(sessionRes.status).toBe(302);
    expect(sessionRes.headers['location']).toContain('cart-int-001');
  });

  it('Step 3: GET /session/:token with same token returns 410 (single-use)', async () => {
    const setupRes = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send(SETUP_XML(SHARED_SECRET));

    const tokenMatch = setupRes.text.match(/\/session\/([a-f0-9-]+)/);
    const token = tokenMatch![1];

    nock(API_BASE).post(`/cart/${TENANT}/carts`).reply(201, { cartId: 'cart-single-use' });
    await request(app).get(`/session/${token}`);

    const secondAttempt = await request(app).get(`/session/${token}`);
    expect(secondAttempt.status).toBe(410);
  });

  it('Step 4: Returns 401 for invalid shared secret', async () => {
    const res = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send(SETUP_XML('wrong-secret'));

    expect(res.status).toBe(401);
  });
});

describe('OCI punchout flow', () => {
  const SHARED_SECRET = 'integration-test-secret';

  beforeAll(async () => {
    const hash = await hashSecret(SHARED_SECRET);
    (configStore.getConfig as jest.Mock).mockResolvedValue({
      sharedSecretHash: hash,
      serviceAccount: { clientId: 'test-client', clientSecret: 'test-secret' },
      storefrontBaseUrl: 'https://store.example.com',
      cxmlEnabled: true,
      ociEnabled: true,
      operationAllowed: 'edit' as const,
      ociOkCode: 'ADDFROMCATALOG' as const,
      buyerMappings: [],
    });

    const mockGetToken = jest.fn().mockResolvedValue('mock-access-token');
    (auth.TokenCache as jest.Mock).mockImplementation(() => ({ getToken: mockGetToken }));
  });

  afterEach(() => nock.cleanAll());

  it('POST /punchout/oci/setup redirects to session URL', async () => {
    const res = await request(app)
      .post('/punchout/oci/setup')
      .type('form')
      .send({
        HOOK_URL: 'https://sap.example.com/oci/return',
        USERNAME: 'oci-buyer-001',
        PASSWORD: SHARED_SECRET,
        '~OkCode': 'ADDFROMCATALOG',
        '~Caller': 'SAPLMOB',
      });

    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/session/');
  });
});
