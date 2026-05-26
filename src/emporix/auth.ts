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
  saas_token?: string;
  expires_in: number;
  /** camelCase as returned by GET /customerlogin/auth/anonymous/login */
  sessionId: string;
}

/**
 * Anonymous customer login via the b2b-showcase endpoint.
 * Returns access_token, saas_token, sessionId, expires_in.
 *
 * The storefront reads ?customerToken=&saasToken=&customerTokenExpiresIn= and
 * calls loginBasedOnCustomerToken(), which restores the anonymous session.
 * The cart must be created with session-id=<sessionId> so the storefront's
 * syncCart(sessionId) can find it after login.
 *
 * Endpoint: GET /customerlogin/auth/anonymous/login?client_id=...&hybris-tenant=...
 * (The b2b-showcase accessToken.js uses a GET with query params, not POST form body)
 */
export async function getAnonymousTokenFull(
  apiBase: string,
  clientId: string,
  tenantId: string,
): Promise<AnonymousTokenResponse> {
  let res: { data: AnonymousTokenResponse };
  try {
    res = await axios.get<AnonymousTokenResponse>(
      `${apiBase}/customerlogin/auth/anonymous/login`,
      {
        params: { client_id: clientId, 'hybris-tenant': tenantId },
        timeout: 5000,
      },
    );
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (err as any)?.response?.data ?? (err instanceof Error ? err.message : String(err));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.response?.status;
    throw new Error(`Failed to get anonymous login (HTTP ${status}): ${JSON.stringify(detail)}`, { cause: err });
  }
  console.log('[getAnonymousTokenFull] raw keys:', Object.keys(res.data).join(', '), '| sessionId:', res.data.sessionId, '| saas_token present:', !!res.data.saas_token);
  return res.data;
}
