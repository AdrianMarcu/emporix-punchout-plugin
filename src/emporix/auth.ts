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

/**
 * Anonymous customer token — required for cart creation.
 * Uses the tenant-scoped customerlogin endpoint with the app-level credentials.
 * The token encodes an anonymous session so the cart API doesn't require an
 * explicit session-id or customerId in the request body.
 */
export async function getAnonymousToken(
  apiBase: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  let res: { data: { access_token: string } };
  try {
    res = await axios.post<{ access_token: string }>(
      `${apiBase}/customerlogin/${tenantId}/auth/anonymous/token`,
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
  return res.data.access_token;
}
