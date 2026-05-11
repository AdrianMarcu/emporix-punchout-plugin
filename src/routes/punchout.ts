import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parsePunchOutSetupRequest } from '../protocols/cxml/parser';
import { buildSetupResponse, buildOrderMessage } from '../protocols/cxml/generator';
import { parseOciSetupRequest } from '../protocols/oci/parser';
import { buildOciReturnFields } from '../protocols/oci/generator';
import { SessionStore } from '../session/store';
import { getConfig } from '../admin/configStore';
import { verifySecret } from '../crypto';
import { config as appConfig } from '../config';
import type { CxmlCartItem } from '../protocols/cxml/types';
import type { OciReturnItem } from '../protocols/oci/types';
import type { EmporixCart } from '../emporix/types';
import axios from 'axios';

const store = new SessionStore(appConfig.redis);

export function createPunchoutRouter(tenantId: string): Router {
  const router = Router();

  router.post('/cxml/setup', async (req: Request, res: Response) => {
    const xmlBody = req.body as string;
    let parsed;
    try {
      parsed = parsePunchOutSetupRequest(xmlBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse error';
      res.status(400).type('text/xml').send(buildCxmlError(400, msg));
      return;
    }

    const cfg = await getConfig(tenantId, '').catch(() => null);
    if (!cfg || !cfg.cxmlEnabled) {
      res.status(503).type('text/xml').send(buildCxmlError(503, 'Punchout not configured'));
      return;
    }

    const secretValid = await verifySecret(parsed.sharedSecret, cfg.sharedSecretHash);
    if (!secretValid) {
      res.status(401).type('text/xml').send(buildCxmlError(401, 'Invalid credentials'));
      return;
    }

    const mapping = cfg.buyerMappings.find(m => m.buyerOrgId === parsed.buyerOrgId);
    const customerGroupId = mapping?.customerGroupId ?? '';

    const sessionId = uuidv4();
    const token = uuidv4();
    await store.saveSession({
      sessionId,
      protocol: 'cxml',
      buyerOrgId: parsed.buyerOrgId,
      customerGroupId,
      browserFormPostUrl: parsed.browserFormPostUrl,
      buyerCookie: parsed.buyerCookie,
      emporixCartId: null,
      createdAt: new Date().toISOString(),
    }, appConfig.sessionTtlSeconds);
    await store.saveToken(token, sessionId, appConfig.tokenTtlSeconds);

    const startPageUrl = `${appConfig.pluginHost}/session/${token}`;
    res.status(200).type('text/xml').send(buildSetupResponse(startPageUrl));
  });

  router.post('/oci/setup', async (req: Request, res: Response) => {
    let parsed;
    try {
      parsed = parseOciSetupRequest(req.body as Record<string, string>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse error';
      res.status(400).json({ error: msg });
      return;
    }

    const cfg = await getConfig(tenantId, '').catch(() => null);
    if (!cfg || !cfg.ociEnabled) {
      res.status(503).json({ error: 'OCI punchout not configured' });
      return;
    }

    const secretValid = await verifySecret(parsed.password, cfg.sharedSecretHash);
    if (!secretValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const mapping = cfg.buyerMappings.find(m => m.buyerOrgId === parsed.username);
    const customerGroupId = mapping?.customerGroupId ?? '';

    const sessionId = uuidv4();
    const token = uuidv4();
    await store.saveSession({
      sessionId,
      protocol: 'oci',
      buyerOrgId: parsed.username,
      customerGroupId,
      browserFormPostUrl: parsed.hookUrl,
      buyerCookie: '',
      emporixCartId: null,
      createdAt: new Date().toISOString(),
    }, appConfig.sessionTtlSeconds);
    await store.saveToken(token, sessionId, appConfig.tokenTtlSeconds);

    res.redirect(`${appConfig.pluginHost}/session/${token}`);
  });

  router.post('/return', async (req: Request, res: Response) => {
    const { cartId, sessionId } = req.body as { cartId?: string; sessionId?: string };
    const session = sessionId ? await store.getSession(sessionId) : null;
    if (!session) {
      res.status(410).send(expiredPage());
      return;
    }

    const cfg = await getConfig(tenantId, '').catch(() => null);
    if (!cfg) {
      res.status(503).send(expiredPage());
      return;
    }

    let cart: EmporixCart;
    try {
      const cartRes = await axios.get<EmporixCart>(
        `${appConfig.emporix.apiBase}/cart/${tenantId}/carts/${cartId ?? session.emporixCartId}`,
        { timeout: appConfig.outboundTimeoutMs },
      );
      cart = cartRes.data;
    } catch {
      res.status(502).send(expiredPage());
      return;
    }

    if (session.protocol === 'cxml') {
      const items: CxmlCartItem[] = cart.items.map(i => ({
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.price.amount,
        currency: i.price.currency,
        uom: i.uom,
      }));
      const orderMsg = buildOrderMessage(session.buyerCookie, cfg.operationAllowed, items, cart.currency);
      try {
        await axios.post(session.browserFormPostUrl, orderMsg, {
          headers: { 'Content-Type': 'text/xml' },
          timeout: appConfig.outboundTimeoutMs,
        });
      } catch {
        res.status(502).send(expiredPage());
        return;
      }
      res.status(200).send('<html><body>Cart transferred. You may close this window.</body></html>');
    } else {
      const ociItems: OciReturnItem[] = cart.items.map(i => ({
        description: i.name,
        matnr: i.sku,
        quantity: i.quantity,
        unit: i.uom,
        price: i.price.amount,
        currency: i.price.currency,
        vendorMat: i.sku,
      }));
      const fields = buildOciReturnFields(ociItems, cfg.ociOkCode);
      const formHtml = buildOciFormHtml(session.browserFormPostUrl, fields);
      res.status(200).send(formHtml);
    }

    await store.deleteSession(session.sessionId);
  });

  return router;
}

function buildCxmlError(code: number, text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><cXML><Response><Status code="${code}" text="${text}"/></Response></cXML>`;
}

function expiredPage(): string {
  return '<html><body><p>Your punchout session has expired or an error occurred. Please return to your procurement system and try again.</p></body></html>';
}

function buildOciFormHtml(hookUrl: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`)
    .join('\n');
  return `<html><body onload="document.forms[0].submit()">
<form method="POST" action="${hookUrl}">${inputs}</form>
</body></html>`;
}
