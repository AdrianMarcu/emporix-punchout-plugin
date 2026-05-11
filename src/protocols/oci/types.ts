export interface OciSetupRequest {
  hookUrl: string;
  username: string;
  password: string;
  okCode: string;
  caller: string;
}

export interface OciReturnItem {
  description: string;
  matnr: string;
  quantity: number;
  unit: string;
  price: number;
  currency: string;
  vendorMat: string;
}
