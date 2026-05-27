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
      // Existing cart IDs discovered during cleanup — used as 409 fallback.
      let existingCustomerCartIds: string[] = [];

      if (cfg.punchoutCustomer?.email && cfg.punchoutCustomer?.password && anonTokenData) {
        try {
          const customerLogin = await emporixClient.loginCustomer(
            cfg.punchoutCustomer.email,
            cfg.punchoutCustomer.password,
            `Bearer ${saToken}`,  // service account token — satisfies Apigee without linking anonymous session
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
          console.log('[session] customer login succeeded — will find or create customer-owned cart');

          // Customer login auto-creates a cart in Emporix, so direct cart creation
          // always hits 409. Find the existing cart first using multiple query strategies;
          // only fall back to explicit creation if nothing is found.
          try {
            const me = await emporixClient.getCustomerMe(cartBearerToken);
            const customerNumber = me.customerNumber;
            console.log('[session] punchout customer number:', customerNumber);
            const foundId = await emporixClient.findCustomerCartId(
              customerNumber,
              cartBearerToken,
              `Bearer ${saToken}`,
              anonTokenData.sessionId,
            );
            if (foundId) {
              existingCustomerCartIds = [foundId];
              console.log('[session] existing customer cart found — will use:', foundId);
            } else {
              console.log('[session] no existing cart found — will attempt creation');
            }
          } catch (lookupErr) {
            console.warn('[session] cart lookup error:', lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
          }
        } catch (loginErr) {
          console.warn('[session] punchout customer login failed:', loginErr instanceof Error ? loginErr.message : String(loginErr));
          console.warn('[session] falling back to anonymous cart — storefront may fail to load the cart');
        }
      } else if (!cfg.punchoutCustomer?.email) {
        console.warn('[session] no punchoutCustomer configured — set PUNCHOUT_USER_EMAIL/PUNCHOUT_USER_PASSWORD or configure via admin UI');
      }

      // Step 3: Use the existing customer cart if found, otherwise create one.
      // Emporix auto-creates a cart on customer login, so POST /carts with a customer
      // JWT always hits 409. We find it first; creation is a fallback for fresh accounts.
      const cartSessionId = anonTokenData?.sessionId ?? session.sessionId;
      let cartId: string;
      if (existingCustomerCartIds.length > 0) {
        cartId = existingCustomerCartIds[0];
        console.log('[session] using existing customer cart:', cartId);
      } else {
        try {
          cartId = await emporixClient.createGuestCart(
            session.customerGroupId,
            cartSessionId,
            cartBearerToken,
            cartSaasToken,
          );
          console.log('[session] cart created — cartId:', cartId);
        } catch (createErr: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const httpStatus = (createErr as any)?.cause?.response?.status;
          if (httpStatus === 409) {
            // Last-ditch: retry find (may have appeared since the earlier lookup)
            const retryId = await emporixClient.findCustomerCartId(
              '',  // customerNumber unknown at this point; strategies without it will still run
              cartBearerToken,
              `Bearer ${saToken}`,
              cartSessionId,
            );
            if (retryId) {
              cartId = retryId;
              console.log('[session] 409 fallback — found cart on retry:', cartId);
            } else {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }
      }

      await store.updateCartId(sessionId, cartId);
      res.cookie('punchout_session', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: appConfig.sessionTtlSeconds * 1000,
        secure: process.env.NODE_ENV === 'production',
      });

      // Step 4: Build the redirect URL.
      // Step 4: Build the redirect URL.
      // When using a customer JWT we deliberately omit cartId from the URL.
      // Passing cartId causes the storefront to call an Emporix "merge cart" API,
      // which returns 400 "Cart cannot be merged into itself" because the cartId
      // is already the customer's active cart. Without cartId the storefront simply
      // calls getCartAccount({ customerId }) after loginBasedOnCustomerToken() and
      // finds the same cart naturally — no merge needed.
      // The cartId is stored in the session (updateCartId above) for the return flow.
      const params = new URLSearchParams();
      if (!redirectCustomerToken) {
        // Anonymous fallback: storefront needs cartId to find the anonymous cart by session.
        params.set('cartId', cartId);
      }
      if (redirectCustomerToken && redirectSaasToken) {
        // Use pt_* prefix so the storefront's syncAuth() does NOT process these directly.
        // punchout-widget.js intercepts them, injects into localStorage under the keys
        // syncAuth() checks (externalCustomerToken / externalSaasToken / externalTokenExpiresIn),
        // strips the params, and reloads — preventing the infinite-reload loop.
        params.set('pt_customerToken', redirectCustomerToken);
        params.set('pt_saasToken', redirectSaasToken);
        params.set('pt_expiresIn', String(redirectExpiresIn));
      }
      // punchoutSessionId is read by punchout-widget.js on the storefront.
      // The widget stores it in sessionStorage so the "Return Cart to Procurement"
      // button can navigate to GET /punchout/return?session=<id> even after SPA navigation.
      params.set('punchoutSessionId', sessionId);
      const redirectUrl = `${cfg.storefrontBaseUrl}?${params.toString()}`;
      console.log('[session] redirecting to storefront:', redirectUrl.replace(/customerToken=[^&]+/, 'customerToken=<redacted>').replace(/saasToken=[^&]+/, 'saasToken=<redacted>'));
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
