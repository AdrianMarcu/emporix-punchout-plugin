import { parseOciSetupRequest } from '../../../src/protocols/oci/parser';

describe('parseOciSetupRequest', () => {
  it('parses valid OCI form fields', () => {
    const body = {
      HOOK_URL: 'https://sap.example.com/oci/return',
      USERNAME: 'buyer-org-002',
      PASSWORD: 'oci-secret',
      '~OkCode': 'ADDFROMCATALOG',
      '~Caller': 'SAPLMOB',
    };
    const result = parseOciSetupRequest(body);
    expect(result.hookUrl).toBe('https://sap.example.com/oci/return');
    expect(result.username).toBe('buyer-org-002');
    expect(result.password).toBe('oci-secret');
    expect(result.okCode).toBe('ADDFROMCATALOG');
    expect(result.caller).toBe('SAPLMOB');
  });

  it('throws when HOOK_URL is missing', () => {
    expect(() => parseOciSetupRequest({ USERNAME: 'x', PASSWORD: 'y' })).toThrow('Missing HOOK_URL');
  });

  it('defaults okCode to ADDFROMCATALOG when absent', () => {
    const body = { HOOK_URL: 'https://sap.example.com/oci/return', USERNAME: 'x', PASSWORD: 'y' };
    const result = parseOciSetupRequest(body);
    expect(result.okCode).toBe('ADDFROMCATALOG');
  });
});
