import { Router, Request, Response } from 'express';
import { emporixJwtMiddleware } from '../middleware/emporixJwt';
import { getConfig, saveConfig, PluginConfig } from './configStore';
import { EmporixClient } from '../emporix/client';
import { TokenCache } from '../emporix/auth';
import { config as appConfig } from '../config';

function extractToken(req: Request): string {
  return (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
}

export function createAdminRouter(): Router {
  const router = Router();
  let customerGroupsCache: import('../emporix/auth').TokenCache | null = null;
  let customerGroupsCacheClientId = '';
  router.use(emporixJwtMiddleware);
  router.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'self' https://admin.emporix.io");
    next();
  });

  router.get('/config', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const token = extractToken(req);
    const cfg = await getConfig(tenantId, token).catch(() => null);
    if (!cfg) { res.json({}); return; }
    const { serviceAccount, sharedSecretHash: _omit, ...safe } = cfg;
    res.json({ ...safe, serviceAccount: { clientId: serviceAccount.clientId, clientSecret: '***' } });
  });

  router.post('/config', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const token = extractToken(req);
    try {
      await saveConfig(tenantId, req.body as Parameters<typeof saveConfig>[1], token);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to save config' });
    }
  });

  router.get('/buyers', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const token = extractToken(req);
    const cfg = await getConfig(tenantId, token).catch(() => null);
    res.json(cfg?.buyerMappings ?? []);
  });

  router.post('/buyers', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const token = extractToken(req);
    const cfg = await getConfig(tenantId, token).catch(() => null);
    if (!cfg) { res.status(404).json({ error: 'Config not found' }); return; }
    const { buyerOrgId, customerGroupId } = req.body as { buyerOrgId: string; customerGroupId: string };
    const existing = cfg.buyerMappings.findIndex(m => m.buyerOrgId === buyerOrgId);
    if (existing >= 0) cfg.buyerMappings[existing].customerGroupId = customerGroupId;
    else cfg.buyerMappings.push({ buyerOrgId, customerGroupId });
    await saveConfig(tenantId, cfg, token);
    res.json(cfg.buyerMappings);
  });

  router.get('/customer-groups', async (req: Request, res: Response) => {
    const tenantId = req.tenantId!;
    const token = extractToken(req);
    const cfg = await getConfig(tenantId, token).catch(() => null);
    if (!cfg) { res.json([]); return; }
    try {
      if (!customerGroupsCache || customerGroupsCacheClientId !== cfg.serviceAccount.clientId) {
        customerGroupsCache = new TokenCache(
          appConfig.emporix.apiBase,
          tenantId,
          cfg.serviceAccount.clientId,
          cfg.serviceAccount.clientSecret,
        );
        customerGroupsCacheClientId = cfg.serviceAccount.clientId;
      }
      const serviceToken = await customerGroupsCache.getToken();
      const client = new EmporixClient(appConfig.emporix.apiBase, tenantId, appConfig.outboundTimeoutMs);
      const groups = await client.getCustomerGroups(`Bearer ${serviceToken}`);
      res.json(groups);
    } catch {
      res.status(502).json({ error: 'Failed to fetch customer groups' });
    }
  });

  return router;
}
