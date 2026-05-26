import axios from 'axios';
import type { EmporixCart, CustomerGroup } from './types';

export interface CustomerLoginResponse {
  accessToken: string;
  saasToken: string;
  expiresIn: number;
}

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

  /**
   * Fetch the customer's profile to obtain their customerNumber.
   * Uses the customer's own JWT (Bearer token).
   */
  async getCustomerMe(customerBearer: string): Promise<{ customerNumber: string; [key: string]: unknown }> {
    const res = await axios.get<{ customerNumber: string; [key: string]: unknown }>(
      `${this.apiBase}/customer/${this.tenantId}/me`,
      { ...this.axiosOpts, headers: { Authorization: customerBearer } },
    );
    return res.data;
  }

  /**
   * List cart IDs for a specific customer using the service account token.
   * Uses ?customerId= query param so the service account can see any customer's carts.
   * Never throws — returns [] on error.
   */
  async listCartIdsByCustomer(customerId: string, serviceAccountBearer: string): Promise<string[]> {
    try {
      const res = await axios.get(
        `${this.apiBase}/cart/${this.tenantId}/carts`,
        {
          ...this.axiosOpts,
          headers: { Authorization: serviceAccountBearer },
          params: { customerId },
        },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      console.log('[listCartIdsByCustomer] response keys:', raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : String(raw));
      console.log('[listCartIdsByCustomer] response preview:', JSON.stringify(raw).slice(0, 400));
      const carts: unknown[] = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.items) ? raw.items
        : Array.isArray(raw?.carts) ? raw.carts
        : Array.isArray(raw?.results) ? raw.results
        : Array.isArray(raw?.content) ? raw.content
        : [];
      console.log('[listCartIdsByCustomer] parsed cart count:', carts.length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return carts.map((c: any) => c.id || c.cartId).filter(Boolean);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.warn('[listCartIdsByCustomer] failed:', (err as any)?.response?.data ?? (err instanceof Error ? err.message : String(err)));
      return [];
    }
  }

  /** Delete a cart by ID (service account token recommended). Ignores 404. */
  async deleteCart(cartId: string, bearerToken: string): Promise<void> {
    try {
      await axios.delete(
        `${this.apiBase}/cart/${this.tenantId}/carts/${cartId}`,
        { ...this.axiosOpts, headers: { Authorization: bearerToken } },
      );
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.response?.status;
      if (status !== 404) throw err;
    }
  }

  /**
   * Log in as a real customer using email+password against the anonymous session.
   * POST /customer/{tenant}/login with Authorization: Bearer <anonToken>
   * Returns { accessToken, saasToken, expiresIn } — a real JWT the storefront accepts for /me.
   */
  async loginCustomer(email: string, password: string, anonymousToken: string): Promise<CustomerLoginResponse> {
    const url = `${this.apiBase}/customer/${this.tenantId}/login`;
    try {
      const res = await axios.post<CustomerLoginResponse>(
        url,
        { email, password },
        {
          ...this.axiosOpts,
          headers: {
            Authorization: `Bearer ${anonymousToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      return res.data;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data ?? (err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpStatus = (err as any)?.response?.status;
      throw new Error(`Customer login failed (HTTP ${httpStatus}): ${JSON.stringify(detail)}`, { cause: err });
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
