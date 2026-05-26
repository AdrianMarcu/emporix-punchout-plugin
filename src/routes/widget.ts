import { Router, Request, Response } from 'express';
import cors from 'cors';
import { config as appConfig } from '../config';

export function createWidgetRouter(): Router {
  const router = Router();

  /**
   * Cross-origin widget script loaded by the storefront.
   *
   * On first load it captures ?punchoutSessionId= from the URL (set by the plugin's
   * session redirect) and stores it in sessionStorage so it survives SPA navigation.
   * The floating button navigates the tab to GET /punchout/return?session=<id>,
   * which is a top-level navigation that includes the plugin's SameSite:lax cookie
   * AND the explicit session param — so it always works even cross-domain.
   *
   * How to embed in the storefront:
   *   <script src="https://<plugin-host>/punchout-widget.js"></script>
   * Add this to the storefront's public/index.html (or equivalent entry HTML).
   */
  router.get('/punchout-widget.js', cors(), (_req: Request, res: Response) => {
    const pluginHost = appConfig.pluginHost;
    res.type('application/javascript').send(`
(function() {
  var PLUGIN = ${JSON.stringify(pluginHost)};
  var SK = '_punchout_session_id';

  // Capture the sessionId from URL params on the initial storefront redirect.
  // The plugin embeds ?punchoutSessionId=<uuid> in the storefront URL.
  var urlParams = new URLSearchParams(window.location.search);
  var fromUrl = urlParams.get('punchoutSessionId');
  if (fromUrl) {
    sessionStorage.setItem(SK, fromUrl);
    // Clean the param from the visible URL without triggering a navigation
    urlParams.delete('punchoutSessionId');
    var clean = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
    history.replaceState(null, '', clean);
  }

  var sessionId = sessionStorage.getItem(SK);
  if (!sessionId) return;

  var btn = document.createElement('button');
  btn.textContent = 'Return Cart to Procurement';
  btn.style.cssText = [
    'position:fixed','bottom:24px','right:24px','z-index:2147483647',
    'padding:13px 22px','background:#1d4ed8','color:#fff',
    'border:none','border-radius:6px','cursor:pointer',
    'font-size:14px','font-weight:600','font-family:inherit',
    'box-shadow:0 4px 14px rgba(0,0,0,.25)',
    'transition:background .15s ease',
  ].join(';');
  btn.addEventListener('mouseover', function(){ btn.style.background='#1e40af'; });
  btn.addEventListener('mouseout',  function(){ btn.style.background='#1d4ed8'; });

  btn.addEventListener('click', function() {
    btn.textContent = 'Returning…';
    btn.disabled = true;
    // Top-level navigation — SameSite:lax cookie is sent; session param is a
    // belt-and-suspenders redundancy for truly cross-domain deployments.
    window.location.href = PLUGIN + '/punchout/return?session=' + encodeURIComponent(sessionId);
  });

  document.body.appendChild(btn);
})();
`);
  });

  return router;
}
