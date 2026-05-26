import { Router, Request, Response } from 'express';
import { SessionStore } from '../session/store';
import { EmporixClient } from '../emporix/client';
import { TokenCache, getAnonymousTokenFull, type AnonymousTokenResponse } from '../emporix/auth';
import { getConfig } from '../admin/configStore';
import type { PluginConfig } from '../admin/configStore';
import { config as appConfig } from '../config';
import redis from '../redis';

const store = new SessionStore(redis);

export function createSessionRouter(tenantId: string): Router {
  const router = Router();

  const bootstrapCache = new TokenCache(
    appConfig.emporix.apiBase,
    tenantId,
    appConfig.emporix.clientId,
    appConfig.emporix.clientSecret,
  );

  let serviceAccountCache: TokenCache | null = null;
  let serviceAccountClientId: string | null = null;

  router.get('/:token', async (req: Request, res: Response) => {
    const { token } = req.params;
    console.log('[session] GET /:token —', token.slice(0, 8) + '…');

    const sessionId = await store.consumeToken(token);
    if (!sessionId) {
      console.warn('[session] token not found or expired');
      res.status(410).send(expiredPage());
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      console.warn('[session] session not found:', sessionId);
      res.status(410).send(expiredPage());
      return;
    }
    console.log('[session] session loaded — protocol:', session.protocol, 'sessionId:', sessionId, 'customerGroupId:', session.customerGroupId);

    let cfg: PluginConfig | null = null;
    try {
      const bootstrapToken = await bootstrapCache.getToken();
      cfg = await getConfig(tenantId, bootstrapToken);
    } catch {
      cfg = null;
    }

    if (!cfg) {
      console.error('[session] plugin config missing');
      res.status(503).send('<html><body><p>Plugin not configured. Please contact the supplier.</p></body></html>');
      return;
    }
    console.log('[session] config loaded — storefrontBaseUrl:', cfg.storefrontBaseUrl);

    try {
      if (!serviceAccountCache || serviceAccountClientId !== cfg.serviceAccount.clientId) {
        serviceAccountCache = new TokenCache(
          appConfig.emporix.apiBase,
          tenantId,
          cfg.serviceAccount.clientId,
          cfg.serviceAccount.clientSecret,
        );
        serviceAccountClientId = cfg.serviceAccount.clientId;
      }
      const saToken = await serviceAccountCache.getToken();

      // Get anonymous customer token so the storefront can adopt the cart.
      // The b2b-showcase reads ?customerToken=&saasToken=&customerTokenExpiresIn=
      // and calls loginBasedOnCustomerToken() — it then finds carts by saas-token.
      let anonTokenData: AnonymousTokenResponse | null = null;
      try {
        // GET /customerlogin/auth/anonymous/login?client_id=...&hybris-tenant=...
        // Must use the storefront app's client_id (REACT_APP_CLIENT_ID), not the
        // plugin service account — the anonymous login endpoint only accepts
        // storefront-registered public clients.
        // Priority: admin-UI config → STOREFRONT_CLIENT_ID env var → plugin bootstrap client
        // Note: env var is ignored when Redis config exists, so check it explicitly here.
        const storefrontClientId =
          cfg.storefrontClientId ??
          process.env.STOREFRONT_CLIENT_ID ??
          appConfig.emporix.clientId;
        const source = cfg.storefrontClientId ? 'config' : process.env.STOREFRONT_CLIENT_ID ? 'env-var' : 'fallback';
        console.log('[session] anon token — using client_id:', storefrontClientId, '| source:', source);
        anonTokenData = await getAnonymousTokenFull(
          appConfig.emporix.apiBase,
          storefrontClientId,
          tenantId,
        );
        console.log('[session] anonymous token obtained, saas_token present:', !!anonTokenData.saas_token, '| sessionId:', anonTokenData.sessionId);
      } catch (anonErr) {
        console.warn('[session] could not get anonymous token:', anonErr instanceof Error ? anonErr.message : String(anonErr));
      }

      const emporixClient = new EmporixClient(
        appConfig.emporix.apiBase,
        tenantId,
        appConfig.outboundTimeoutMs,
      );
      // Use the anonymous login's sessionId as the cart session-id so the
      // storefront's syncCart(sessionId) finds this cart after loginBasedOnCustomerToken().
      const cartSessionId = anonTokenData?.sessionId ?? session.sessionId;
      const cartId = await emporixClient.createGuestCart(
        session.customerGroupId,
        cartSessionId,
        `Bearer ${saToken}`,
        anonTokenData?.saas_token,
      );
      console.log('[session] cart created — cartId:', cartId);

      await store.updateCartId(sessionId, cartId);
      res.cookie('punchout_session', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: appConfig.sessionTtlSeconds * 1000,
        secure: process.env.NODE_ENV === 'production',
      });

      // Pass all three token params so the storefront's auth-provider calls
      // loginBasedOnCustomerToken() → which calls syncAuth() a second time →
      // which finally runs setSessionId(getSessionId()) with the real sessionId
      // that AccessToken() stored in localStorage on the first syncAuth pass.
      // Without this second syncAuth(), sessionId stays null in React state and
      // cartAccount.id is always undefined ("Cart with code undefined not found").
      //
      // saasToken must be truthy for insertLocalStorageValue to store it; if the
      // anonymous login doesn't return one, fall back to the access_token itself.
      const params = new URLSearchParams({ cartId });
      if (anonTokenData) {
        params.set('customerToken', anonTokenData.access_token);
        params.set('saasToken', anonTokenData.saas_token || anonTokenData.access_token);
        params.set('customerTokenExpiresIn', String(anonTokenData.expires_in));
      }
      const redirectUrl = `${cfg.storefrontBaseUrl}?${params.toString()}`;
      console.log('[session] redirecting to:', redirectUrl.replace(/customerToken=[^&]+/, 'customerToken=<redacted>').replace(/saasToken=[^&]+/, 'saasToken=<redacted>'));
      res.redirect(redirectUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpStatus = (err as any)?.cause?.response?.status;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpBody = JSON.stringify((err as any)?.cause?.response?.data ?? '');
      console.error('[session] cart init failed:', msg, 'HTTP', httpStatus, httpBody);
      res.status(502).send(
        `<html><body><p>Failed to initialize cart: ${msg} (HTTP ${httpStatus ?? '?'}: ${httpBody})</p></body></html>`
      );
    }
  });

  return router;
}

function expiredPage(): string {
  return '<html><body><p>Your punchout session has expired. Please return to your procurement system and try again.</p></body></html>';
}
