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

      // Step 1: Get an anonymous session token (provides sessionId for cart creation).
      // Must use the storefront app's client_id (REACT_APP_CLIENT_ID), not the service account —
      // the anonymous login endpoint only accepts storefront-registered public clients.
      // env var takes top priority; then admin-UI config; then bootstrap client as last resort.
      let anonTokenData: AnonymousTokenResponse | null = null;
      try {
        const storefrontClientId =
          process.env.STOREFRONT_CLIENT_ID ??
          cfg.storefrontClientId ??
          appConfig.emporix.clientId;
        const source = process.env.STOREFRONT_CLIENT_ID ? 'env-var' : cfg.storefrontClientId ? 'config' : 'fallback';
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

      // Step 2: If a punchout customer is configured, log in as that real customer NOW,
      // BEFORE creating the cart. The cart must be created with the customer's JWT + saasToken
      // so Emporix treats it as a customer-owned cart — NOT an anonymous cart.
      //
      // Why this order matters:
      //   If we create the cart with the anonymous saasToken, the storefront later tries
      //   to assign the anonymous cart to the logged-in customer, and Emporix rejects it:
      //   "Anonymous cart cannot be assigned to a legal entity".
      //   Creating the cart with the customer's own saasToken avoids this entirely.
      let cartBearerToken = `Bearer ${saToken}`;   // fallback: service account
      let cartSaasToken = anonTokenData?.saas_token; // fallback: anonymous saasToken
      let redirectCustomerToken: string | null = null;
      let redirectSaasToken: string | null = null;
      let redirectExpiresIn = anonTokenData?.expires_in ?? 3600;

      if (cfg.punchoutCustomer?.email && cfg.punchoutCustomer?.password && anonTokenData) {
        try {
          const customerLogin = await emporixClient.loginCustomer(
            cfg.punchoutCustomer.email,
            cfg.punchoutCustomer.password,
            anonTokenData.access_token,
          );
          // Use the customer JWT for cart creation — creates a customer-owned cart.
          // Do NOT pass saasToken as a cart header: Emporix has a unique index on saasToken
          // and the same customer saasToken persists across logins, so a second session
          // would cause HTTP 409 "Duplicate key found for a unique index".
          // The customer JWT alone is sufficient to own the cart; saasToken is only
          // needed in the redirect URL so the storefront can call loginBasedOnCustomerToken.
          cartBearerToken = `Bearer ${customerLogin.accessToken}`;
          cartSaasToken = undefined;
          redirectCustomerToken = customerLogin.accessToken;
          redirectSaasToken = customerLogin.saasToken;
          redirectExpiresIn = customerLogin.expiresIn;
          console.log('[session] customer login succeeded — cart will be created as customer-owned (not anonymous)');

          // The punchout customer is a shared account — delete any leftover carts from
          // previous sessions before creating a new one (avoids 409 duplicate-key error).
          const existingCartIds = await emporixClient.listCartIds(cartBearerToken);
          if (existingCartIds.length > 0) {
            console.log(`[session] clearing ${existingCartIds.length} existing cart(s) for punchout customer`);
            await Promise.all(
              existingCartIds.map(id =>
                emporixClient.deleteCart(id, `Bearer ${saToken}`).catch(delErr =>
                  console.warn(`[session] could not delete cart ${id}:`, delErr instanceof Error ? delErr.message : String(delErr)),
                ),
              ),
            );
          }
        } catch (loginErr) {
          console.warn('[session] punchout customer login failed:', loginErr instanceof Error ? loginErr.message : String(loginErr));
          console.warn('[session] falling back to anonymous cart — storefront may fail to load the cart');
        }
      } else if (!cfg.punchoutCustomer?.email) {
        console.warn('[session] no punchoutCustomer configured — set PUNCHOUT_USER_EMAIL/PUNCHOUT_USER_PASSWORD or configure via admin UI');
      }

      // Step 3: Create the cart using whichever credentials we have.
      const cartSessionId = anonTokenData?.sessionId ?? session.sessionId;
      const cartId = await emporixClient.createGuestCart(
        session.customerGroupId,
        cartSessionId,
        cartBearerToken,
        cartSaasToken,
      );
      console.log('[session] cart created — cartId:', cartId);

      await store.updateCartId(sessionId, cartId);
      res.cookie('punchout_session', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: appConfig.sessionTtlSeconds * 1000,
        secure: process.env.NODE_ENV === 'production',
      });

      // Step 4: Build the redirect URL.
      // Pass customerToken/saasToken/customerTokenExpiresIn so the storefront calls
      // loginBasedOnCustomerToken() → second syncAuth() → sessionId updates in React state.
      const params = new URLSearchParams({ cartId });
      if (redirectCustomerToken && redirectSaasToken) {
        params.set('customerToken', redirectCustomerToken);
        params.set('saasToken', redirectSaasToken);
        params.set('customerTokenExpiresIn', String(redirectExpiresIn));
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
