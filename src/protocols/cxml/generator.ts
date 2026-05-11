import { create } from 'xmlbuilder2';
import type { CxmlCartItem } from './types';

export function buildSetupResponse(startPageUrl: string): string {
  const payloadId = `${Date.now()}@emporix-punchout-plugin`;
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('cXML', {
      payloadID: payloadId,
      timestamp: new Date().toISOString(),
    })
    .ele('Response')
    .ele('Status', { code: '200', text: 'OK' }).up()
    .ele('PunchOutSetupResponse')
    .ele('StartPage')
    .ele('URL').txt(startPageUrl).up()
    .up()
    .up()
    .up();
  return root.end({ prettyPrint: false });
}

export function buildOrderMessage(
  buyerCookie: string,
  operationAllowed: 'create' | 'edit' | 'inspect',
  items: CxmlCartItem[],
  currency: string,
): string {
  const payloadId = `${Date.now()}@emporix-punchout-plugin`;
  const totalCents = items.reduce((sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity, 0);
  const total = (totalCents / 100).toFixed(2);

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('cXML', {
      payloadID: payloadId,
      timestamp: new Date().toISOString(),
    });

  const poom = root
    .ele('Message')
    .ele('PunchOutOrderMessage');

  poom.ele('BuyerCookie').txt(buyerCookie).up();
  poom
    .ele('PunchOutOrderMessageHeader', { operationAllowed })
    .ele('Total')
    .ele('Money', { currency }).txt(total).up()
    .up()
    .up();

  for (const item of items) {
    poom
      .ele('ItemIn', { quantity: String(item.quantity) })
      .ele('ItemID')
      .ele('SupplierPartID').txt(item.sku).up()
      .up()
      .ele('ItemDetail')
      .ele('UnitPrice').ele('Money', { currency: item.currency }).txt(item.unitPrice.toFixed(2)).up().up()
      .ele('Description', { 'xml:lang': 'en' }).txt(item.name).up()
      .ele('UnitOfMeasure').txt(item.uom).up()
      .up()
      .up();
  }

  return root.end({ prettyPrint: false });
}
