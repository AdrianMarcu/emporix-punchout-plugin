import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { createPunchoutRouter } from './routes/punchout';
import { createSessionRouter } from './routes/session';
import { createAdminRouter } from './admin/router';
import { punchoutRateLimiter } from './middleware/rateLimiter';
import { createWidgetRouter } from './routes/widget';

const DASHBOARD_ORIGIN = 'https://admin.emporix.io';
const adminCors = cors({ origin: DASHBOARD_ORIGIN, credentials: true });

const app = express();
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'frame-ancestors': ["'self'", DASHBOARD_ORIGIN],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' }));

// When Emporix loads remoteEntry.js in an iframe, serve index.html instead of raw JS
app.get('/admin-ui/assets/remoteEntry.js', cors(), (req, res, next) => {
  const accept = req.headers['accept'] || '';
  if (accept.includes('text/html')) {
    res.sendFile(path.join(__dirname, '../src/admin-ui-dist/index.html'));
  } else {
    next();
  }
});

// Allow Emporix dashboard to load remoteEntry.js and call admin routes cross-origin
app.use('/admin-ui', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../src/admin-ui-dist')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
// Punchout endpoints are called by external procurement systems (SAP Ariba, Coupa, etc.)
// and the demo simulator — allow any origin.
app.use('/punchout', cors(), punchoutRateLimiter, createPunchoutRouter(config.emporix.tenantId));
app.use('/session', createSessionRouter(config.emporix.tenantId));
app.use('/admin', adminCors, createAdminRouter());
app.use('/', createWidgetRouter());

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Punchout plugin listening on port ${config.port}`);
  });
}

export { app };
