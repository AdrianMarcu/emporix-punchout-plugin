import { Router, Request, Response } from 'express';
import cors from 'cors';
import { config as appConfig } from '../config';

export function createWidgetRouter(tenantId: string): Router {
  const router = Router();

  /**
   * Cross-origin widget script loaded by the storefront (one <script> tag in index.html).
   *
   * Flow:
   * 1. Plugin redirects to storefront with ?pt_customerToken=X&pt_saasToken=Y&pt_expiresIn=Z&punchoutSessionId=S
   *    (pt_* prefix — NOT the standard customerToken/saasToken that syncAuth() reads from URL,
   *    which would trigger loginBasedOnCustomerToken and an infinite reload loop)
   * 2. Widget runs (before React), stores punchoutSessionId in sessionStorage
   * 3. Widget detects pt_* params → fetches GET /customer/{tenant}/me with the customer JWT
   *    (Emporix API has Access-Control-Allow-Origin: * so cross-origin fetch works)
   * 4. Writes the full 'user' JSON blob + customerToken + saasToken directly to localStorage,
   *    strips all pt_* params from URL, reloads once
   * 5. On reload: URL is clean, localStorage.user is set → b2b-showcase syncAuth() reads it,
   *    sets isLoggedIn=true immediately — NO loginBasedOnCustomerToken call.
   *    (loginBasedOnCustomerToken calls GET /iam/{tenant}/users/me/scopes which 404s on this
   *    tenant, leaving the auth state permanently "loading". Bypassing it avoids the hang.)
   * 6. Widget shows "Return Cart to Procurement" button from sessionStorage session ID
   */
  router.get('/punchout-widget.js', cors(), (_req: Request, res: Response) => {
    const pluginHost = appConfig.pluginHost;
    const apiBase = appConfig.emporix.apiBase;
    res.type('application/javascript').send(`
(function() {
  var PLUGIN   = ${JSON.stringify(pluginHost)};
  var TENANT   = ${JSON.stringify(tenantId)};
  var API_BASE = ${JSON.stringify(apiBase)};
  var SK = '_punchout_session_id';
  var urlParams = new URLSearchParams(window.location.search);

  // Step 1: Capture punchoutSessionId into sessionStorage so it survives the reload.
  var sessionIdFromUrl = urlParams.get('punchoutSessionId');
  if (sessionIdFromUrl) {
    sessionStorage.setItem(SK, sessionIdFromUrl);
  }

  // Step 2: Handle auth token injection when redirected from the plugin.
  var ptToken   = urlParams.get('pt_customerToken');
  var ptSaas    = urlParams.get('pt_saasToken');
  var ptExpires = urlParams.get('pt_expiresIn');

  if (ptToken && ptSaas) {
    // Hide the page while we do async work so there is no flash of anonymous content.
    document.documentElement.style.visibility = 'hidden';

    // Strip all punchout params from URL immediately (synchronous).
    ['pt_customerToken', 'pt_saasToken', 'pt_expiresIn', 'punchoutSessionId'].forEach(function(k) {
      urlParams.delete(k);
    });
    var cleanUrl = window.location.pathname
      + (urlParams.toString() ? '?' + urlParams.toString() : '')
      + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);

    // Fetch the customer profile from Emporix (CORS: Access-Control-Allow-Origin: *).
    // b2b-showcase reads localStorage.getItem('user') to determine isLoggedIn.
    // By writing it here we bypass loginBasedOnCustomerToken, which calls
    // GET /iam/{tenant}/users/me/scopes — an endpoint that 404s on this tenant,
    // causing syncAuth() to leave isLoggedIn=false permanently (infinite loading screen).
    fetch(API_BASE + '/customer/' + TENANT + '/me', {
      headers: { 'Authorization': 'Bearer ' + ptToken }
    })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(me) {
      var expiresAt = Date.now() + Number(ptExpires || 3600) * 1000;
      // Build the same shape loginBasedOnCustomerToken would produce:
      // the raw /me response plus userTenant + username appended.
      var user = Object.assign({}, me, {
        userTenant: TENANT,
        username: me.email || me.contactEmail || me.id,
      });
      localStorage.setItem('user',                   JSON.stringify(user));
      localStorage.setItem('customerToken',          ptToken);
      localStorage.setItem('saasToken',              ptSaas);
      localStorage.setItem('customerTokenExpiresIn', String(expiresAt));
      localStorage.setItem('tenant',                 TENANT);
      // Reload — React will mount with user in localStorage → isLoggedIn=true,
      // no loginBasedOnCustomerToken call, no /iam/scopes call.
      window.location.reload();
    })
    .catch(function(err) {
      // /me fetch failed — fall back to externalCustomerToken so syncAuth() can
      // attempt loginBasedOnCustomerToken as a best-effort last resort.
      console.warn('[punchout-widget] /me fetch failed (' + err + ') — falling back to externalCustomerToken');
      localStorage.setItem('externalCustomerToken',  ptToken);
      localStorage.setItem('externalSaasToken',      ptSaas);
      if (ptExpires) localStorage.setItem('externalTokenExpiresIn', ptExpires);
      document.documentElement.style.visibility = '';
      window.location.reload();
    });
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
