import { Router, Request, Response } from 'express';
import { config as appConfig } from '../config';

export function createWidgetRouter(): Router {
  const router = Router();

  router.get('/punchout-widget.js', (_req: Request, res: Response) => {
    res.type('application/javascript').send(`
(function() {
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }
  var sessionId = getCookie('punchout_session');
  if (!sessionId) return;
  var btn = document.createElement('button');
  btn.textContent = 'Return Cart to Procurement System';
  btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 20px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;';
  btn.addEventListener('click', function() {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = '${appConfig.pluginHost}/punchout/return';
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'sessionId';
    input.value = sessionId;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  });
  document.body.appendChild(btn);
})();
`);
  });

  return router;
}
