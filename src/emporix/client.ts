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
    const headers = { Authorization: accessToken };
    try {
      // Emporix splits cart metadata and line items into separate resources.
      const [cartRes, itemsRes] = await Promise.all([
        axios.get(`${this.apiBase}/cart/${this.tenantId}/carts/${cartId}`,
          { ...this.axiosOpts, headers }),
        axios.get(`${this.apiBase}/cart/${this.tenantId}/carts/${cartId}/items`,
          { ...this.axiosOpts, headers }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawCart = cartRes.data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItems = itemsRes.data as any;
      const itemArr: unknown[] = Array.isArray(rawItems) ? rawItems
        : Array.isArray(rawItems?.items) ? rawItems.items : [];

      console.log('[getCart] cart.currency:', rawCart.currency, '| items count:', itemArr.length);
      if (itemArr.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const first = itemArr[0] as any;
        console.log('[getCart] first item keys:', Object.keys(first).join(', '));
        console.log('[getCart] first item sample:', JSON.stringify(first).slice(0, 500));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = itemArr.map((i: any) => ({
        itemId: i.id ?? '',
        sku:      i.itemYrn?.split(':').pop() ?? i.product?.id ?? i.productId ?? i.code ?? i.sku ?? '',
        name:     typeof i.name === 'string' ? i.name : (i.name?.en ?? i.productName ?? ''),
        quantity: Number(i.quantity ?? 1),
        price: {
          amount:   Number(i.unitPrice?.effectiveValue ?? i.price?.amount ?? i.itemPrice?.effectiveValue ?? 0),
          currency: i.unitPrice?.currency ?? i.price?.currency ?? rawCart.currency ?? 'USD',
        },
        uom: i.measurementUnit ?? i.uom ?? 'EA',
      }));

      return {
        cartId: rawCart.id ?? cartId,
        items,
        currency: rawCart.currency ?? 'USD',
      };
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
   * The Emporix API gateway (Apigee) requires a valid Bearer token on every
   * request, including the customer login endpoint. We pass the service account
   * token (client_credentials grant) to satisfy the gateway.
   *
   * We deliberately do NOT pass an anonymous customer token here. Passing an
   * anonymous token links the customer's new session to that anonymous session ID.
   * The storefront browser calls the same anonymous login endpoint with the same
   * client_id and inherits the same session, causing Emporix's getCart merge logic
   * to find the same cart as both the "session cart" and the "customer cart" →
   * HTTP 400 "Cart cannot be merged into itself". A service account token has no
   * anonymous session and does not cause this linkage.
   */
  async loginCustomer(email: string, password: string, serviceAccountBearer: string): Promise<CustomerLoginResponse> {
    const url = `${this.apiBase}/customer/${this.tenantId}/login`;
    try {
      const res = await axios.post<CustomerLoginResponse>(
        url,
        { email, password },
        {
          ...this.axiosOpts,
          headers: {
            Authorization: serviceAccountBearer,
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
