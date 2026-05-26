import axios from 'axios';
import type { EmporixCart, CustomerGroup } from './types';

export class EmporixClient {
  constructor(
    private apiBase: string,
    private tenantId: string,
    private timeoutMs: number,
  ) {}

  private get axiosOpts() {
    return { timeout: this.timeoutMs };
  }

  async createGuestCart(customerGroupId: string, sessionId: string, accessToken: string): Promise<string> {
    const url = `${this.apiBase}/cart/${this.tenantId}/carts`;
    // Emporix cart API contract (confirmed from docs):
    //   - session-id goes in a REQUEST HEADER, not the body
    //   - saas-token header can be omitted for guest/anonymous carts
    //   - body uses siteCode + currency, not sessionId/customerId
    const body: Record<string, unknown> = { currency: 'USD', siteCode: 'main' };
    if (customerGroupId) body.customerGroup = customerGroupId;
    try {
      const res = await axios.post<Record<string, unknown>>(
        url, body,
        {
          ...this.axiosOpts,
          headers: {
            Authorization: accessToken,
            'session-id': sessionId,
            'Content-Type': 'application/json',
          },
        },
      );
      // Log full response so we can identify the correct field name
      console.log('[createGuestCart] HTTP', res.status, 'headers:', JSON.stringify(res.headers));
      console.log('[createGuestCart] body:', JSON.stringify(res.data));
      // Emporix may return 'id', 'cartId', or a Location header on 201
      const cartId =
        (res.data['id'] as string | undefined) ??
        (res.data['cartId'] as string | undefined) ??
        (res.headers['location'] as string | undefined)?.split('/').pop();
      if (!cartId) throw new Error(`Cart created but could not find cart ID. Status=${res.status} body=${JSON.stringify(res.data)} location=${res.headers['location']}`);
      return cartId;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data;
      throw new Error(`Failed to create Emporix cart: ${JSON.stringify(detail)}`, { cause: err });
    }
  }

  async getCart(cartId: string, accessToken: string): Promise<EmporixCart> {
    try {
      const res = await axios.get<EmporixCart>(
        `${this.apiBase}/cart/${this.tenantId}/carts/${cartId}`,
        { ...this.axiosOpts, headers: { Authorization: accessToken } },
      );
      return res.data;
    } catch (err) {
      throw new Error('Failed to fetch Emporix cart', { cause: err });
    }
  }

  async getCustomerGroups(accessToken: string): Promise<CustomerGroup[]> {
    const url = `${this.apiBase}/customer-group/${this.tenantId}/customergroups`;
    try {
      const res = await axios.get<CustomerGroup[]>(url, {
        ...this.axiosOpts, headers: { Authorization: accessToken },
      });
      return res.data;
    } catch (err) {
      throw new Error(`Failed to fetch customer groups from ${url}`, { cause: err });
    }
  }
}
