import { Router, Request, Response } from 'express';
import { SessionStore } from '../session/store';
import { TokenCache } from '../emporix/auth';
import { getConfig } from '../admin/configStore';
import { config as appConfig } from '../config';
import redis from '../redis';

const store = new SessionStore(redis);

/**
 * GET /shop — punchout shopping wrapper page.
 *
 * Instead of redirecting the browser directly to the storefront, the session
 * handler redirects here first. This page:
 *   1. Validates the session UUID (prevents open-redirect abuse)
 *   2. Looks up the storefrontBaseUrl from plugin config (never from URL params)
 *   3. Renders a thin top-banner with a "Return Cart to Procurement" button
 *   4. Loads the storefront inside a full-screen iframe with the auth params
 *
 * The return button navigates the outer page to GET /punchout/return?session=<id>,
 * which fetches the cart and auto-submits the cXML/OCI form to the buyer's
 * BrowserFormPost URL. No storefront modification required.
 */
export function createShopRouter(tenantId: string): Router {
  const router = Router();

  const bootstrapCache = new TokenCache(
    appConfig.emporix.apiBase,
    tenantId,
    appConfig.emporix.clientId,
    appConfig.emporix.clientSecret,
  );

  router.get('/', async (req: Request, res: Response) => {
    const query = req.query as Record<string, string>;
    const sessionId = query.session;

    if (!sessionId) {
      res.status(400).send('<html><body><p>Missing session.</p></body></html>');
      return;
    }

    const session = await store.getSession(sessionId);
    if (!session) {
      res.status(410).send(expiredPage());
      return;
    }

    let cfg;
    try {
      cfg = await getConfig(tenantId, await bootstrapCache.getToken());
    } catch {
      cfg = null;
    }
    if (!cfg) {
      res.status(503).send('<html><body><p>Plugin not configured.</p></body></html>');
      return;
    }

    // Forward all query params except 'session' into the iframe src.
    // These are the storefront auth tokens (customerToken, saasToken, cartId, etc.)
    // that the storefront reads on first render to log the user in.
    const iframeParams = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (k !== 'session') iframeParams.set(k, v);
    }
    const iframeSrc = iframeParams.toString()
      ? `${cfg.storefrontBaseUrl}?${iframeParams.toString()}`
      : cfg.storefrontBaseUrl;

    res.type('text/html').send(buildWrapper(iframeSrc, sessionId, appConfig.pluginHost));
  });

  return router;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function expiredPage(): string {
  return '<html><body><p>Your punchout session has expired. Please return to your procurement system and try again.</p></body></html>';
}

function buildWrapper(iframeSrc: string, sessionId: string, pluginHost: string): string {
  const returnUrl = `${pluginHost}/punchout/return?session=${encodeURIComponent(sessionId)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Punchout Shopping Session</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%;overflow:hidden}
  body{display:flex;flex-direction:column}
  #punchout-bar{
    background:#1e3a5f;color:#fff;
    padding:8px 16px;
    display:flex;align-items:center;justify-content:space-between;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    font-size:13px;flex-shrink:0;z-index:9999;
    border-bottom:2px solid #2563eb;
  }
  #punchout-bar span{opacity:.85;letter-spacing:.01em}
  #return-btn{
    background:#2563eb;color:#fff;border:none;
    padding:7px 18px;border-radius:5px;
    font-size:13px;font-weight:600;cursor:pointer;
    white-space:nowrap;
  }
  #return-btn:hover{background:#1d4ed8}
  #return-btn:disabled{background:#64748b;cursor:not-allowed}
  #shop-frame{flex:1;border:none;width:100%}
  #iframe-error{
    display:none;flex:1;align-items:center;justify-content:center;
    flex-direction:column;gap:16px;font-family:-apple-system,sans-serif;
    background:#f8fafc;color:#1e293b;text-align:center;padding:40px;
  }
  #iframe-error a{color:#2563eb;font-weight:600}
</style>
</head>
<body>
<div id="punchout-bar">
  <span>🛒 Punchout Session Active &mdash; Add items to your cart, then click return when done.</span>
  <button id="return-btn" onclick="doReturn()">Return Cart to Procurement ↩</button>
</div>
<iframe id="shop-frame"
  src="${escapeHtml(iframeSrc)}"
  allow="storage-access; same-origin"
  onload="frameLoaded()"
  onerror="frameError()">
</iframe>
<div id="iframe-error">
  <p style="font-size:18px">⚠️ The storefront could not be loaded in the iframe.</p>
  <p style="color:#64748b;font-size:14px">
    This usually means the storefront host sends an <code>X-Frame-Options</code> header.<br>
    <a href="${escapeHtml(iframeSrc)}" target="_blank">Open the storefront directly</a>,
    then add <code>&lt;script src="${escapeHtml(pluginHost)}/punchout-widget.js"&gt;&lt;/script&gt;</code>
    to your storefront's <code>index.html</code> as a fallback.
  </p>
</div>
<script>
var SESSION_ID = ${JSON.stringify(sessionId)};
var RETURN_URL = ${JSON.stringify(returnUrl)};

function doReturn() {
  var btn = document.getElementById('return-btn');
  btn.textContent = 'Returning…';
  btn.disabled = true;
  window.location.href = RETURN_URL;
}

function frameLoaded() {
  // If the iframe loaded but was blocked by X-Frame-Options, the frame src is
  // 'about:blank' — detect that and show the error panel.
  try {
    var frame = document.getElementById('shop-frame');
    if (frame.contentDocument && frame.contentDocument.location.href === 'about:blank') {
      frameError();
    }
  } catch (_) {
    // Cross-origin access expected when iframe loaded successfully — ignore.
  }
}

function frameError() {
  document.getElementById('shop-frame').style.display = 'none';
  document.getElementById('iframe-error').style.display = 'flex';
}
</script>
</body>
</html>`;
}
