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

  async createGuestCart(customerGroupId: string, accessToken: string): Promise<string> {
    try {
      const res = await axios.post<{ cartId: string }>(
        `${this.apiBase}/cart/${this.tenantId}/carts`,
        { currency: 'USD', customerGroup: customerGroupId },
        { ...this.axiosOpts, headers: { Authorization: accessToken } },
      );
      return res.data.cartId;
    } catch {
      throw new Error('Failed to create Emporix cart');
    }
  }

  async getCart(cartId: string, accessToken: string): Promise<EmporixCart> {
    const res = await axios.get<EmporixCart>(
      `${this.apiBase}/cart/${this.tenantId}/carts/${cartId}`,
      { ...this.axiosOpts, headers: { Authorization: accessToken } },
    );
    return res.data;
  }

  async getCustomerGroups(accessToken: string): Promise<CustomerGroup[]> {
    const res = await axios.get<CustomerGroup[]>(
      `${this.apiBase}/customer-group/${this.tenantId}/customergroups`,
      { ...this.axiosOpts, headers: { Authorization: accessToken } },
    );
    return res.data;
  }
}
