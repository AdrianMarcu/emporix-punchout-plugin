import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parsePunchOutSetupRequest } from '../protocols/cxml/parser';
import { buildSetupResponse, buildOrderMessage } from '../protocols/cxml/generator';
import { parseOciSetupRequest } from '../protocols/oci/parser';
import { buildOciReturnFields } from '../protocols/oci/generator';
import { SessionStore } from '../session/store';
import { getConfig } from '../admin/configStore';
import type { PluginConfig } from '../admin/configStore';
import { TokenCache } from '../emporix/auth';
import { verifySecret } from '../crypto';
import { config as appConfig } from '../config';
import redis from '../redis';
import type { CxmlCartItem } from '../protocols/cxml/types';
import type { OciReturnItem } from '../protocols/oci/types';
import type { EmporixCart } from '../emporix/types';
import { EmporixClient } from '../emporix/client';

const store = new SessionStore(redis);

/** Escape special characters for safe insertion into XML attributes and text nodes. */
function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escape special characters for safe insertion into HTML attributes and text nodes. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createPunchoutRouter(tenantId: string): Router {
  const router = Router();

  const bootstrapCache = new TokenCache(
    appConfig.emporix.apiBase,
    tenantId,
    appConfig.emporix.clientId,
    appConfig.emporix.clientSecret,
  );

  router.post('/cxml/setup', async (req: Request, res: Response) => {
    // Body may arrive as string (text/xml parsed) or Buffer (raw) — normalise
    const raw = req.body;
    const xmlBody = typeof raw === 'string' ? raw
      : Buffer.isBuffer(raw) ? raw.toString('utf8')
      : typeof raw === 'object' ? JSON.stringify(raw)   // should not happen
      : String(raw ?? '');
    let parsed;
    try {
      parsed = parsePunchOutSetupRequest(xmlBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Parse error';
      console.error('[punchout/cxml/setup] parse error:', msg, '| body type:', typeof raw, '| first 200:', xmlBody.slice(0, 200));
      res.status(400).type('text/xml').send(buildCxmlError(400, msg));
      return;
    }

    let cfg: PluginConfig | null = null;
    try {
      cfg = await getConfig(tenantId, await bootstrapCache.getToken());
    } catch { cfg = null; }
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

    let cfg: PluginConfig | null = null;
    try {
      cfg = await getConfig(tenantId, await bootstrapCache.getToken());
    } catch { cfg = null; }
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

  /** Shared logic for both POST /return (widget form) and GET /return (navigation). */
  async function executeReturn(sessionId: string | undefined, res: Response): Promise<void> {
    const session = sessionId ? await store.getSession(sessionId) : null;
    if (!session) {
      res.status(410).send(expiredPage());
      return;
    }

    if (!session.emporixCartId) {
      res.status(410).send('<html><body><p>No items in cart yet. Please add products before returning to procurement.</p></body></html>');
      return;
    }

    let cfg: PluginConfig | null = null;
    try {
      cfg = await getConfig(tenantId, await bootstrapCache.getToken());
    } catch { cfg = null; }
    if (!cfg) {
      res.status(503).send(expiredPage());
      return;
    }

    let cart: EmporixCart;
    try {
      const saTokenCache = new TokenCache(
        appConfig.emporix.apiBase,
        tenantId,
        cfg.serviceAccount.clientId,
        cfg.serviceAccount.clientSecret,
      );
      const saToken = await saTokenCache.getToken();
      const emporixClient = new EmporixClient(appConfig.emporix.apiBase, tenantId, appConfig.outboundTimeoutMs);
      cart = await emporixClient.getCart(session.emporixCartId, `Bearer ${saToken}`);
    } catch (err) {
      console.error('[return] failed to fetch cart:', err instanceof Error ? err.message : String(err));
      res.status(502).send(expiredPage());
      return;
    }

    try {
      if (session.protocol === 'cxml') {
        const items: CxmlCartItem[] = (cart.items ?? []).map(i => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.price.amount,
          currency: i.price.currency,
          uom: i.uom || 'EA',
        }));
        const orderMsg = buildOrderMessage(session.buyerCookie, cfg.operationAllowed, items, cart.currency);
        const formHtml = buildCxmlReturnFormHtml(session.browserFormPostUrl, orderMsg);
        res.status(200).send(formHtml);
      } else {
        const ociItems: OciReturnItem[] = (cart.items ?? []).map(i => ({
          description: i.name,
          matnr: i.sku,
          quantity: i.quantity,
          unit: i.uom || 'EA',
          price: i.price.amount,
          currency: i.price.currency,
          vendorMat: i.sku,
        }));
        const fields = buildOciReturnFields(ociItems, cfg.ociOkCode);
        const formHtml = buildOciFormHtml(session.browserFormPostUrl, fields);
        res.status(200).send(formHtml);
      }
    } finally {
      await store.deleteSession(session.sessionId);
    }
  }

  /** Legacy widget: POSTs sessionId in form body. */
  router.post('/return', async (req: Request, res: Response) => {
    const { sessionId } = req.body as { sessionId?: string };
    await executeReturn(sessionId, res);
  });

  /**
   * New widget: navigates here via window.location (top-level GET).
   * sessionId is passed as ?session= query param (set by plugin in redirect URL,
   * stored in storefront sessionStorage by the widget script).
   */
  router.get('/return', async (req: Request, res: Response) => {
    const sessionId = req.query.session as string | undefined;
    await executeReturn(sessionId, res);
  });

  /** Demo procurement simulator — launcher page. */
  router.get('/demo', (_req: Request, res: Response) => {
    res.type('text/html').send(buildDemoLaunchPage(appConfig.pluginHost));
  });

  /**
   * Demo procurement simulator — cXML receiver.
   * The plugin's BrowserFormPost form auto-submits here when the user returns from the store.
   */
  router.post('/demo', (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    const cxml: string = typeof body === 'string' ? body
      : typeof body?.cXMLData === 'string' ? body.cXMLData
      : JSON.stringify(body);
    res.type('text/html').send(buildDemoReceivePage(cxml));
  });

  return router;
}

function buildCxmlError(code: number, text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><cXML><Response><Status code="${code}" text="${escapeXml(text)}"/></Response></cXML>`;
}

function expiredPage(): string {
  return '<html><body><p>Your punchout session has expired or an error occurred. Please return to your procurement system and try again.</p></body></html>';
}

function buildOciFormHtml(hookUrl: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n');
  return `<html><body onload="document.forms[0].submit()">
<form method="POST" action="${escapeHtml(hookUrl)}">${inputs}</form>
</body></html>`;
}

function buildCxmlReturnFormHtml(postUrl: string, xmlData: string): string {
  return `<html><body onload="document.forms[0].submit()">
<form method="POST" action="${escapeHtml(postUrl)}">
<input type="hidden" name="cXMLData" value="${escapeHtml(xmlData)}">
</form>
</body></html>`;
}

function buildDemoLaunchPage(pluginHost: string): string {
  const escaped = escapeHtml(pluginHost);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Punchout Demo — Procurement Simulator</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px;margin:60px auto;padding:0 24px;background:#f8fafc;color:#1e293b}
  h1{font-size:24px;margin-bottom:4px}
  .sub{color:#64748b;margin-bottom:32px;font-size:14px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;margin-bottom:20px}
  .btn{background:#2563eb;color:#fff;border:none;padding:12px 28px;border-radius:6px;font-size:15px;cursor:pointer;font-weight:600}
  .btn:hover{background:#1d4ed8}
  .btn:disabled{background:#94a3b8;cursor:not-allowed}
  #status{margin-top:16px;font-size:13px;color:#475569;white-space:pre-wrap}
  code{background:#f1f5f9;padding:2px 6px;border-radius:3px;font-size:12px}
</style>
</head>
<body>
<h1>🏢 Procurement System Simulator</h1>
<p class="sub">Simulates a procurement platform (Ariba, Coupa, SAP…) initiating a punchout session.</p>
<div class="card">
  <p>Click the button below to send a <code>PunchOutSetupRequest</code> to the plugin. The storefront will open in a new tab. Add items, then click the blue <strong>"Return Cart to Procurement"</strong> button in the storefront.</p>
  <button class="btn" id="launchBtn" onclick="startPunchout()">🛒 Start Punchout Session</button>
  <div id="status"></div>
</div>
<script>
var PLUGIN = '${escaped}';
async function startPunchout() {
  var btn = document.getElementById('launchBtn');
  var status = document.getElementById('status');
  btn.disabled = true;
  status.textContent = 'Sending PunchOutSetupRequest…';
  var ts = new Date().toISOString();
  var xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<cXML payloadID="demo-' + Date.now() + '" timestamp="' + ts + '">'
    + '<Header>'
    + '<From><Credential domain="NetworkId"><Identity>demo-buyer-org</Identity></Credential></From>'
    + '<To><Credential domain="NetworkId"><Identity>supplier</Identity></Credential></To>'
    + '<Sender>'
    + '<Credential domain="NetworkId"><Identity>demo-buyer-org</Identity>'
    + '<SharedSecret>demo-secret-2026</SharedSecret></Credential>'
    + '<UserAgent>DemoSimulator/1.0</UserAgent>'
    + '</Sender>'
    + '</Header>'
    + '<Request deploymentMode="test">'
    + '<PunchOutSetupRequest operation="create">'
    + '<BuyerCookie>demo-cookie-' + Date.now() + '</BuyerCookie>'
    + '<BrowserFormPost><URL>' + PLUGIN + '/punchout/demo</URL></BrowserFormPost>'
    + '</PunchOutSetupRequest>'
    + '</Request>'
    + '</cXML>';
  try {
    var res = await fetch(PLUGIN + '/punchout/cxml/setup', {
      method:'POST', headers:{'Content-Type':'text/xml'}, body: xml
    });
    var text = await res.text();
    var match = text.match(/<URL>([^<]+)<\\/URL>/);
    if (!match) { status.textContent = 'Error — no URL in response:\\n' + text; btn.disabled=false; return; }
    var url = match[1];
    status.textContent = 'Session started!\\nOpening storefront in new tab…\\n\\nStartPage URL:\\n' + url;
    window.open(url, '_blank');
    btn.disabled = false;
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;
}

function buildDemoReceivePage(cxml: string): string {
  // Extract items from cXML for a readable summary
  const items: Array<{qty: string; sku: string; name: string; price: string; currency: string}> = [];
  const itemRe = /<ItemIn quantity="([^"]+)"[\s\S]*?<SupplierPartID>([^<]+)<\/SupplierPartID>[\s\S]*?<Description[^>]*>([^<]+)<\/Description>[\s\S]*?<Money currency="([^"]+)">([^<]+)<\/Money>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(cxml)) !== null) {
    items.push({ qty: m[1], sku: m[2], name: m[3], currency: m[4], price: m[5] });
  }

  const rows = items.length
    ? items.map(i =>
        `<tr><td>${escapeHtml(i.qty)}</td><td>${escapeHtml(i.sku)}</td><td>${escapeHtml(i.name)}</td>`
        + `<td>${escapeHtml(i.currency)} ${escapeHtml(i.price)}</td></tr>`
      ).join('')
    : '<tr><td colspan="4" style="color:#94a3b8">No items parsed — check raw cXML below</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Punchout Complete — Cart Received</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:60px auto;padding:0 24px;background:#f8fafc;color:#1e293b}
  h1{color:#16a34a}
  table{width:100%;border-collapse:collapse;margin:20px 0;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  th{background:#1e3a5f;color:#fff;padding:10px 14px;text-align:left;font-size:13px}
  td{padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px}
  tr:last-child td{border-bottom:none}
  details{margin-top:24px}
  summary{cursor:pointer;color:#475569;font-size:13px;margin-bottom:8px}
  pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
  .back{display:inline-block;margin-top:24px;color:#2563eb;font-size:13px;text-decoration:none}
  .back:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>✅ Cart returned to procurement system</h1>
<p>The following items were received via <code>PunchOutOrderMessage</code>:</p>
<table>
  <thead><tr><th>Qty</th><th>SKU</th><th>Description</th><th>Unit Price</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<details>
  <summary>📄 Raw cXML payload</summary>
  <pre>${escapeHtml(cxml)}</pre>
</details>
<a class="back" href="javascript:history.back()">← Back to simulator</a>
</body>
</html>`;
}
