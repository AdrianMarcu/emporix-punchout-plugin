export interface EmporixCartItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  price: { amount: number; currency: string };
  uom: string;
}

export interface EmporixCart {
  cartId: string;
  items: EmporixCartItem[];
  currency: string;
}

export interface CustomerGroup {
  id: string;
  name: string;
}
