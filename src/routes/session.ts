import { Router, Request, Response } from 'express';
import { SessionStore } from '../session/store';
import { EmporixClient } from '../emporix/client';
import { TokenCache } from '../emporix/auth';
import { getConfig } from '../admin/configStore';
import { config as appConfig } from '../config';

export function createSessionRouter(tenantId: string): Router {
  const router = Router();
  const store = new SessionStore(appConfig.redis);

  router.get('/:token', async (req: Request, res: Response) => {
    const { token } = req.params;
    const sessionId = await store.consumeToken(token);

    if (!sessionId) {
      res.status(410).send(
        '<html><body><p>Your punchout session has expired. Please return to your procurement system and try again.</p></body></html>'
      );
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(410).send(
        '<html><body><p>Your punchout session has expired. Please return to your procurement system and try again.</p></body></html>'
      );
      return;
    }

    const cfg = await getConfig(tenantId, 'system').catch(() => null);

    res.cookie('punchout_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: appConfig.sessionTtlSeconds * 1000,
    });

    if (!cfg) {
      res.redirect('/');
      return;
    }

    try {
      const tokenCache = new TokenCache(
        appConfig.emporix.apiBase,
        tenantId,
        cfg.serviceAccount.clientId,
        cfg.serviceAccount.clientSecret,
      );
      const accessToken = await tokenCache.getToken();
      const emporixClient = new EmporixClient(
        appConfig.emporix.apiBase,
        tenantId,
        appConfig.outboundTimeoutMs,
      );
      const cartId = await emporixClient.createGuestCart(
        session.customerGroupId,
        `Bearer ${accessToken}`,
      );
      await store.updateCartId(sessionId, cartId);

      res.redirect(`${cfg.storefrontBaseUrl}?cartId=${cartId}`);
    } catch {
      res.status(502).send(
        '<html><body><p>Failed to initialize cart. Please return to your procurement system and try again.</p></body></html>'
      );
    }
  });

  return router;
}
