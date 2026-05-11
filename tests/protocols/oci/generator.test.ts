import { buildOciReturnFields } from '../../../src/protocols/oci/generator';
import type { OciReturnItem } from '../../../src/protocols/oci/types';

const items: OciReturnItem[] = [
  { description: 'Widget A', matnr: 'SKU-001', quantity: 2, unit: 'EA', price: 49.99, currency: 'USD', vendorMat: 'VM-001' },
  { description: 'Widget B', matnr: 'SKU-002', quantity: 1, unit: 'EA', price: 9.99, currency: 'USD', vendorMat: 'VM-002' },
];

describe('buildOciReturnFields', () => {
  it('generates indexed fields for all items', () => {
    const fields = buildOciReturnFields(items, 'ADDFROMCATALOG');
    expect(fields['NEW_ITEM-DESCRIPTION[1]']).toBe('Widget A');
    expect(fields['NEW_ITEM-MATNR[1]']).toBe('SKU-001');
    expect(fields['NEW_ITEM-QUANTITY[1]']).toBe('2');
    expect(fields['NEW_ITEM-DESCRIPTION[2]']).toBe('Widget B');
    expect(fields['~OkCode']).toBe('ADDFROMCATALOG');
  });

  it('handles empty cart', () => {
    const fields = buildOciReturnFields([], 'ADDFROMCATALOG');
    expect(fields['~OkCode']).toBe('ADDFROMCATALOG');
    expect(Object.keys(fields).filter(k => k.startsWith('NEW_ITEM'))).toHaveLength(0);
  });
});
