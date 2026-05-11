import { parsePunchOutSetupRequest } from '../../../src/protocols/cxml/parser';

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cXML payloadID="test-payload-1" timestamp="2026-05-11T10:00:00Z">
  <Header>
    <From>
      <Credential domain="NetworkId">
        <Identity>buyer-org-001</Identity>
      </Credential>
    </From>
    <To>
      <Credential domain="NetworkId">
        <Identity>supplier@emporix.com</Identity>
      </Credential>
    </To>
    <Sender>
      <Credential domain="NetworkId">
        <Identity>buyer-org-001</Identity>
        <SharedSecret>s3cr3t</SharedSecret>
      </Credential>
      <UserAgent>Ariba Buyer 8.2</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <PunchOutSetupRequest operation="create">
      <BuyerCookie>cookie-abc-123</BuyerCookie>
      <BrowserFormPost>
        <URL>https://buyer.example.com/cxml/return</URL>
      </BrowserFormPost>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

describe('parsePunchOutSetupRequest', () => {
  it('parses a valid cXML setup request', () => {
    const result = parsePunchOutSetupRequest(VALID_XML);
    expect(result.payloadId).toBe('test-payload-1');
    expect(result.buyerOrgId).toBe('buyer-org-001');
    expect(result.sharedSecret).toBe('s3cr3t');
    expect(result.buyerCookie).toBe('cookie-abc-123');
    expect(result.browserFormPostUrl).toBe('https://buyer.example.com/cxml/return');
    expect(result.operation).toBe('create');
  });

  it('throws on malformed XML', () => {
    expect(() => parsePunchOutSetupRequest('<broken')).toThrow('Invalid cXML');
  });

  it('throws when BuyerCookie is missing', () => {
    const xml = VALID_XML.replace('<BuyerCookie>cookie-abc-123</BuyerCookie>', '');
    expect(() => parsePunchOutSetupRequest(xml)).toThrow('Missing BuyerCookie');
  });

  it('throws when BrowserFormPost URL is missing', () => {
    const xml = VALID_XML.replace(
      '<BrowserFormPost>\n        <URL>https://buyer.example.com/cxml/return</URL>\n      </BrowserFormPost>',
      ''
    );
    expect(() => parsePunchOutSetupRequest(xml)).toThrow('Missing BrowserFormPost URL');
  });

  it('throws when SharedSecret is missing', () => {
    const xml = VALID_XML.replace('<SharedSecret>s3cr3t</SharedSecret>', '');
    expect(() => parsePunchOutSetupRequest(xml)).toThrow('Missing SharedSecret');
  });
});
