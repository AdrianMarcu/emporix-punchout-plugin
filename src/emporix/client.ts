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
    // Emporix (SAP/Hybris lineage) identifies anonymous customers via the
    // X-Anonymous-Customer-Unique-Id header when using a service-account token.
    // The sessionId body field is accepted by some versions but the header is
    // the canonical approach and works across all Emporix API versions.
    const body: Record<string, unknown> = { currency: 'USD' };
    if (customerGroupId) body.customerGroup = customerGroupId;
    try {
      const res = await axios.post<{ cartId: string }>(
        url, body,
        {
          ...this.axiosOpts,
          headers: {
            Authorization: accessToken,
            'X-Anonymous-Customer-Unique-Id': sessionId,
            'Content-Type': 'application/json',
          },
        },
      );
      return res.data.cartId;
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
