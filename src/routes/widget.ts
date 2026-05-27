import { Router, Request, Response } from 'express';
import cors from 'cors';
import { config as appConfig } from '../config';

export function createWidgetRouter(tenantId: string): Router {
  const router = Router();

  /**
   * Cross-origin widget script loaded by the storefront (one <script> tag in index.html).
   *
   * Flow:
   * 1. Plugin redirects to storefront with ?punchoutSessionId=S (anonymous — no auth tokens)
   * 2. Widget runs, stores punchoutSessionId in sessionStorage
   * 3. Storefront loads as anonymous — user browses and adds items to their anonymous cart
   * 4. Widget shows "Return Cart to Procurement" button
   * 5. User clicks button → widget reads localStorage.sessionId (the storefront's anonymous
   *    session ID) and navigates to GET /punchout/return?session=S&storefrontSession=…
   * 6. Plugin uses storefrontSession to look up the anonymous cart via service-account query
   *    and generates the cXML/OCI response
   *
   * Why anonymous instead of injecting customer auth:
   * b2b-showcase calls GET /session-context/{tenant}/me/context when isLoggedIn=true.
   * That endpoint 404s for this tenant as an uncaught promise rejection, so setLoading(false)
   * never runs → infinite loading screen.  Anonymous browsing sidesteps this entirely.
   */
  router.get('/punchout-widget.js', cors(), (_req: Request, res: Response) => {
    const pluginHost = appConfig.pluginHost;
    res.type('application/javascript').send(`
(function() {
  var PLUGIN = ${JSON.stringify(pluginHost)};
  var SK = '_punchout_session_id';
  var urlParams = new URLSearchParams(window.location.search);

  // Step 1: Capture punchoutSessionId into sessionStorage so it survives SPA navigation.
  var sessionIdFromUrl = urlParams.get('punchoutSessionId');
  if (sessionIdFromUrl) {
    sessionStorage.setItem(SK, sessionIdFromUrl);
    // Strip punchoutSessionId from URL so it doesn't clutter the address bar.
    urlParams.delete('punchoutSessionId');
    var cleanUrl = window.location.pathname
      + (urlParams.toString() ? '?' + urlParams.toString() : '')
      + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
  }

  // Step 2: Show "Return Cart to Procurement" button if in an active punchout session.
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

    // Pass the storefront's anonymous session ID so the plugin can find the correct cart.
    // b2b-showcase stores the anonymous session ID in localStorage under 'sessionId'.
    // The plugin uses GET /cart/{tenant}/carts?sessionId=… (service-account) to locate
    // the cart the user was shopping in during this punchout session.
    var returnUrl = PLUGIN + '/punchout/return?session=' + encodeURIComponent(sessionId);
    try {
      var storefrontSession = localStorage.getItem('sessionId');
      if (storefrontSession) {
        returnUrl += '&storefrontSession=' + encodeURIComponent(storefrontSession);
      }
    } catch(e) {}

    window.location.href = returnUrl;
  });

  document.body.appendChild(btn);
})();
`);
  });

  return router;
}
