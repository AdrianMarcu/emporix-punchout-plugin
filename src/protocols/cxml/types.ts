export interface CxmlSetupRequest {
  payloadId: string;
  buyerOrgId: string;
  sharedSecret: string;
  buyerCookie: string;
  browserFormPostUrl: string;
  operation: 'create' | 'edit' | 'inspect';
}

export interface CxmlCartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  uom: string;
}
