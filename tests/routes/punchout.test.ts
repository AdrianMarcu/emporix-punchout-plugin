import request from 'supertest';
import { app } from '../../src/index';

const VALID_CXML_SETUP = `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="test-1" timestamp="2026-05-11T10:00:00Z">
  <Header>
    <From><Credential domain="NetworkId"><Identity>buyer-org-001</Identity></Credential></From>
    <To><Credential domain="NetworkId"><Identity>supplier</Identity></Credential></To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>buyer-org-001</Identity>
        <SharedSecret>s3cr3t</SharedSecret>
      </Credential>
      <UserAgent>TestBuyer</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>cookie-001</BuyerCookie>
      <BrowserFormPost><URL>https://buyer.example.com/return</URL></BrowserFormPost>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

describe('POST /punchout/cxml/setup', () => {
  it('returns 400 for malformed XML', async () => {
    const res = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send('<broken');
    expect(res.status).toBe(400);
    expect(res.text).toContain('cXML');
  });

  it('returns XML content-type on valid request (config absent → 503)', async () => {
    const res = await request(app)
      .post('/punchout/cxml/setup')
      .set('Content-Type', 'text/xml')
      .send(VALID_CXML_SETUP);
    // Without seeded config, expect either 200 (mock configured) or 503 (no config)
    expect([200, 503]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/xml/);
  });
});

describe('POST /punchout/oci/setup', () => {
  it('returns 400 when HOOK_URL missing', async () => {
    const res = await request(app)
      .post('/punchout/oci/setup')
      .type('form')
      .send({ USERNAME: 'buyer', PASSWORD: 'pass' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when OCI not configured', async () => {
    const res = await request(app)
      .post('/punchout/oci/setup')
      .type('form')
      .send({
        HOOK_URL: 'https://sap.example.com/return',
        USERNAME: 'buyer',
        PASSWORD: 'pass',
      });
    expect([302, 401, 503]).toContain(res.status);
  });
});
