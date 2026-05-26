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
 * Emporix embeds the customer/session identity in this token; passing it to
 * POST /cart/{tenant}/carts satisfies the session-id/customerId requirement.
 */
export async function getAnonymousToken(
  apiBase: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await axios.post<{ access_token: string }>(
    `${apiBase}/customerlogin/auth/anonymous/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 },
  );
  return res.data.access_token;
}
