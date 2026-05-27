import { Router, Request, Response } from 'express';
import cors from 'cors';
import { config as appConfig } from '../config';

export function createWidgetRouter(): Router {
  const router = Router();

  /**
   * Cross-origin widget script loaded by the storefront (one <script> tag in index.html).
   *
   * Flow:
   * 1. Plugin redirects to storefront with ?pt_customerToken=X&pt_saasToken=Y&punchoutSessionId=Z
   *    (renamed params — NOT the standard customerToken/saasToken that the b2b-showcase's
   *    syncAuth() reads, which would trigger an infinite reload loop)
   * 2. Widget runs, stores punchoutSessionId in sessionStorage
   * 3. Widget detects pt_* params → injects into localStorage under the keys syncAuth() checks
   *    (externalCustomerToken / externalSaasToken / externalTokenExpiresIn), strips params, reloads
   * 4. On reload: URL is clean, localStorage has the external token keys
   *    syncAuth() reads them, calls loginBasedOnCustomerToken ONCE, deletes the keys,
   *    calls syncAuth() recursively → finds no params anywhere → loop stops ✓
   * 5. Widget shows "Return Cart to Procurement" button from sessionStorage session ID
   */
  router.get('/punchout-widget.js', cors(), (_req: Request, res: Response) => {
    const pluginHost = appConfig.pluginHost;
    res.type('application/javascript').send(`
(function() {
  var PLUGIN = ${JSON.stringify(pluginHost)};
  var SK = '_punchout_session_id';
  var urlParams = new URLSearchParams(window.location.search);

  // Step 1: Capture punchoutSessionId into sessionStorage so it survives the reload.
  var sessionIdFromUrl = urlParams.get('punchoutSessionId');
  if (sessionIdFromUrl) {
    sessionStorage.setItem(SK, sessionIdFromUrl);
  }

  // Step 2: Handle auth token injection.
  // The plugin uses pt_customerToken/pt_saasToken/pt_expiresIn (renamed) so the
  // b2b-showcase auth-provider does NOT process them directly — its syncAuth()
  // only reads the standard 'customerToken' and 'saasToken' URL params, and
  // calling loginBasedOnCustomerToken from there causes an infinite loop because
  // the URL is never cleaned.
  // We intercept here, inject into the localStorage keys syncAuth() checks, then
  // reload with a clean URL so the storefront processes them exactly once.
  var ptToken   = urlParams.get('pt_customerToken');
  var ptSaas    = urlParams.get('pt_saasToken');
  var ptExpires = urlParams.get('pt_expiresIn');

  if (ptToken && ptSaas) {
    // Inject under the exact localStorage key names b2b-showcase uses (from localstorage.js)
    localStorage.setItem('externalCustomerToken',  ptToken);
    localStorage.setItem('externalSaasToken',      ptSaas);
    if (ptExpires) localStorage.setItem('externalTokenExpiresIn', ptExpires);

    // Strip all punchout params from URL before reload
    ['pt_customerToken', 'pt_saasToken', 'pt_expiresIn', 'punchoutSessionId'].forEach(function(k) {
      urlParams.delete(k);
    });
    var cleanUrl = window.location.pathname
      + (urlParams.toString() ? '?' + urlParams.toString() : '')
      + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);

    // Reload — the page comes back without pt_* params in the URL.
    // syncAuth() finds externalCustomerToken in localStorage → one-time login → no loop.
    window.location.reload();
    return; // Don't continue; widget will re-run after reload
  }

  // Step 3: Show "Return Cart to Procurement" button if in an active punchout session.
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
    window.location.href = PLUGIN + '/punchout/return?session=' + encodeURIComponent(sessionId);
  });

  document.body.appendChild(btn);
})();
`);
  });

  return router;
}
