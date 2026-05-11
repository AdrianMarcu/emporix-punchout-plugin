import { buildSetupResponse, buildOrderMessage } from '../../../src/protocols/cxml/generator';
import type { CxmlCartItem } from '../../../src/protocols/cxml/types';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

describe('buildSetupResponse', () => {
  it('returns valid cXML with StartPage URL', () => {
    const xml = buildSetupResponse('https://plugin.example.com/session/token-abc');
    const doc = xmlParser.parse(xml) as Record<string, unknown>;
    const cxml = doc['cXML'] as Record<string, unknown>;
    const response = cxml['Response'] as Record<string, unknown>;
    const status = response['Status'] as Record<string, unknown>;
    expect(status['@_code']).toBe('200');
    const startPage = (response['PunchOutSetupResponse'] as Record<string, unknown>)['StartPage'] as Record<string, unknown>;
    expect(startPage['URL']).toBe('https://plugin.example.com/session/token-abc');
  });
});

describe('buildOrderMessage', () => {
  const items: CxmlCartItem[] = [
    { sku: 'SKU-001', name: 'Widget A', quantity: 2, unitPrice: 49.99, currency: 'USD', uom: 'EA' },
    { sku: 'SKU-002', name: 'Widget B', quantity: 1, unitPrice: 9.99, currency: 'USD', uom: 'EA' },
  ];

  it('returns valid cXML PunchOutOrderMessage', () => {
    const xml = buildOrderMessage('cookie-abc', 'edit', items, 'USD');
    const doc = xmlParser.parse(xml) as Record<string, unknown>;
    const cxml = doc['cXML'] as Record<string, unknown>;
    const message = cxml['Message'] as Record<string, unknown>;
    const poom = message['PunchOutOrderMessage'] as Record<string, unknown>;
    expect(poom['BuyerCookie']).toBe('cookie-abc');
  });

  it('includes all line items', () => {
    const xml = buildOrderMessage('cookie-abc', 'edit', items, 'USD');
    const doc = xmlParser.parse(xml) as Record<string, unknown>;
    const poom = ((doc['cXML'] as Record<string, unknown>)['Message'] as Record<string, unknown>)['PunchOutOrderMessage'] as Record<string, unknown>;
    const itemsIn = Array.isArray(poom['ItemIn']) ? poom['ItemIn'] : [poom['ItemIn']];
    expect(itemsIn).toHaveLength(2);
  });

  it('handles empty cart', () => {
    const xml = buildOrderMessage('cookie-abc', 'edit', [], 'USD');
    expect(xml).toContain('PunchOutOrderMessage');
  });

  it('escapes special characters in product names', () => {
    const specialItems: CxmlCartItem[] = [
      { sku: 'SKU-003', name: 'Widget <A&B>', quantity: 1, unitPrice: 5.00, currency: 'USD', uom: 'EA' },
    ];
    const xml = buildOrderMessage('cookie', 'edit', specialItems, 'USD');
    expect(xml).not.toContain('Widget <A&B>');
    expect(xml).toContain('Widget');
  });
});
