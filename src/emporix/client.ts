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
      // Log the raw cart so we can verify field names match EmporixCartItem
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = res.data as any;
      console.log('[getCart] raw keys:', Object.keys(raw).join(', '));
      console.log('[getCart] items count:', Array.isArray(raw.items) ? raw.items.length : `not array — type: ${typeof raw.items}`);
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        console.log('[getCart] first item keys:', Object.keys(raw.items[0]).join(', '));
        console.log('[getCart] first item sample:', JSON.stringify(raw.items[0]).slice(0, 400));
      }
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
   * Find the active cart for a customer, trying multiple query strategies.
   * Emporix customer login auto-creates a cart that may not be visible via
   * ?customerId= alone. We try several approaches and return the first hit.
   * Never throws — returns null when no cart is found.
   */
  async findCustomerCartId(
    customerNumber: string,
    customerBearer: string,
    serviceAccountBearer: string,
    anonymousSessionId: string,
  ): Promise<string | null> {
    const strategies: Array<{ label: string; bearer: string; params: Record<string, string> }> = [
      // Customer's own JWT with no filter — most natural "what's my cart?" query
      { label: 'customerJWT/noParams', bearer: customerBearer, params: {} },
      // Service account with customerId
      { label: 'SA/customerId', bearer: serviceAccountBearer, params: { customerId: customerNumber } },
      // Service account with customerId + siteCode
      { label: 'SA/customerId+siteCode', bearer: serviceAccountBearer, params: { customerId: customerNumber, siteCode: 'main' } },
      // Service account with the anonymous sessionId (login may bind anon session → customer cart)
      { label: 'SA/sessionId', bearer: serviceAccountBearer, params: { sessionId: anonymousSessionId } },
    ];

    for (const s of strategies) {
      try {
        const res = await axios.get(
          `${this.apiBase}/cart/${this.tenantId}/carts`,
          { ...this.axiosOpts, headers: { Authorization: s.bearer }, params: s.params },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = res.data as any;
        const carts: unknown[] = Array.isArray(raw) ? raw
          : Array.isArray(raw?.data) ? raw.data
          : Array.isArray(raw?.items) ? raw.items
          : Array.isArray(raw?.carts) ? raw.carts
          : (raw?.id || raw?.cartId) ? [raw]
          : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const id = carts.map((c: any) => c.id || c.cartId).find(Boolean);
        console.log(`[findCustomerCartId] strategy=${s.label} → ${id ? 'found: ' + id : 'no result'}`);
        if (id) return id;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = (err as any)?.response?.status;
        console.log(`[findCustomerCartId] strategy=${s.label} → HTTP ${status ?? 'err'}`);
      }
    }
    return null;
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
   * Log in as a real customer using email+password.
   * POST /customer/{tenant}/login — returns { accessToken, saasToken, expiresIn }.
   *
   * Deliberately called WITHOUT an anonymous token in the Authorization header.
   * Passing an anonymous token would link the customer's new session to that
   * anonymous session ID. The storefront browser calls the same anonymous login
   * endpoint with the same client_id and may get back the same session, causing
   * Emporix's getCart merge logic to find the same cart as both the "session cart"
   * and the "customer cart" → HTTP 400 "Cart cannot be merged into itself".
   */
  async loginCustomer(email: string, password: string): Promise<CustomerLoginResponse> {
    const url = `${this.apiBase}/customer/${this.tenantId}/login`;
    try {
      const res = await axios.post<CustomerLoginResponse>(
        url,
        { email, password },
        {
          ...this.axiosOpts,
          headers: { 'Content-Type': 'application/json' },
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
