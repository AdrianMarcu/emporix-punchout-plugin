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

  async createGuestCart(
    customerGroupId: string,
    sessionId: string,
    accessToken: string,
    saasToken?: string,
  ): Promise<string> {
    const url = `${this.apiBase}/cart/${this.tenantId}/carts`;
    const body: Record<string, unknown> = { currency: 'USD', siteCode: 'main' };
    if (customerGroupId) body.customerGroup = customerGroupId;
    // saas-token associates the cart with the anonymous customer so the
    // storefront can find it via loginBasedOnCustomerToken()
    const headers: Record<string, string> = {
      Authorization: accessToken,
      'session-id': sessionId,
      'Content-Type': 'application/json',
    };
    if (saasToken) headers['saas-token'] = saasToken;
    try {
      const res = await axios.post<{ cartId: string }>(
        url, body,
        { ...this.axiosOpts, headers },
      );
      // Emporix cart creation returns { cartId, yrn } on HTTP 201
      const cartId = res.data.cartId;
      if (!cartId) throw new Error(`Cart created but no cartId in response: ${JSON.stringify(res.data)}`);
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
