import type { OciReturnItem } from './types';

export function buildOciReturnFields(
  items: OciReturnItem[],
  okCode: string,
): Record<string, string> {
  const fields: Record<string, string> = { '~OkCode': okCode };
  items.forEach((item, idx) => {
    const n = idx + 1;
    fields[`NEW_ITEM-DESCRIPTION[${n}]`] = item.description;
    fields[`NEW_ITEM-MATNR[${n}]`] = item.matnr;
    fields[`NEW_ITEM-QUANTITY[${n}]`] = String(item.quantity);
    fields[`NEW_ITEM-UNIT[${n}]`] = item.unit;
    fields[`NEW_ITEM-PRICE[${n}]`] = item.price.toFixed(2);
    fields[`NEW_ITEM-CURRENCY[${n}]`] = item.currency;
    fields[`NEW_ITEM-VENDMAT[${n}]`] = item.vendorMat;
  });
  return fields;
}
