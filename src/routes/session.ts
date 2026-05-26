import { Router, Request, Response } from 'express';
import { SessionStore } from '../session/store';
import { EmporixClient } from '../emporix/client';
import { TokenCache } from '../emporix/auth';
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
    const sessionId = await store.consumeToken(token);

    if (!sessionId) {
      res.status(410).send(expiredPage());
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(410).send(expiredPage());
      return;
    }

    let cfg: PluginConfig | null = null;
    try {
      const bootstrapToken = await bootstrapCache.getToken();
      cfg = await getConfig(tenantId, bootstrapToken);
    } catch {
      cfg = null;
    }

    if (!cfg) {
      res.status(503).send('<html><body><p>Plugin not configured. Please contact the supplier.</p></body></html>');
      return;
    }

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
      const accessToken = await serviceAccountCache.getToken();
      const emporixClient = new EmporixClient(
        appConfig.emporix.apiBase,
        tenantId,
        appConfig.outboundTimeoutMs,
      );
      const cartId = await emporixClient.createGuestCart(
        session.customerGroupId,
        session.sessionId,
        `Bearer ${accessToken}`,
      );
      await store.updateCartId(sessionId, cartId);
      res.cookie('punchout_session', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: appConfig.sessionTtlSeconds * 1000,
        secure: process.env.NODE_ENV === 'production',
      });
      res.redirect(`${cfg.storefrontBaseUrl}?cartId=${cartId}`);
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
