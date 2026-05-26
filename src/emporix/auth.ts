import axios from 'axios';

/** Service-account token via OAuth2 client_credentials — for admin API calls */
export class TokenCache {
  private token: string | null = null;
  private expiresAt = 0;

  constructor(
    private apiBase: string,
    private tenantId: string,
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let data: { access_token: string; expires_in: number };
    try {
      const res = await axios.post<typeof data>(
        `${this.apiBase}/oauth/token`,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 },
      );
      data = res.data;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data ?? (err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpStatus = (err as any)?.response?.status;
      throw new Error(`Emporix auth failed (HTTP ${httpStatus}): ${JSON.stringify(detail)}`, { cause: err });
    }

    this.token = data.access_token;
    const safeExpiresIn = Math.max(data.expires_in - 30, 10);
    this.expiresAt = Date.now() + safeExpiresIn * 1000;
    return this.token;
  }
}

export interface AnonymousTokenResponse {
  access_token: string;
  saas_token: string;
  expires_in: number;
  session_id?: string;
}

/**
 * Anonymous customer token — the Emporix b2b-showcase storefront reads
 * ?customerToken=&saasToken=&customerTokenExpiresIn= from the URL and calls
 * loginBasedOnCustomerToken(), which lets it find the cart associated with
 * that anonymous customer's saas-token.
 *
 * The same saas-token must be passed as the `saas-token` header when
 * creating the cart server-side so the cart is associated with this customer.
 */
export async function getAnonymousTokenFull(
  apiBase: string,
  clientId: string,
  clientSecret: string,
): Promise<AnonymousTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  let res: { data: AnonymousTokenResponse };
  try {
    res = await axios.post<AnonymousTokenResponse>(
      `${apiBase}/customerlogin/auth/anonymous/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 },
    );
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (err as any)?.response?.data ?? (err instanceof Error ? err.message : String(err));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.response?.status;
    throw new Error(`Failed to get anonymous token (HTTP ${status}): ${JSON.stringify(detail)}`, { cause: err });
  }
  console.log('[getAnonymousTokenFull] response keys:', Object.keys(res.data).join(', '));
  return res.data;
}
