import express from 'express';
import path from 'path';
import { Buffer } from 'buffer';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { createPunchoutRouter } from './routes/punchout';
import { createSessionRouter } from './routes/session';
import { createAdminRouter } from './admin/router';
import { punchoutRateLimiter } from './middleware/rateLimiter';
import { createWidgetRouter } from './routes/widget';

if (process.env.NODE_ENV !== 'test' && Buffer.byteLength(config.crypto.aesKey, 'utf8') !== 32) {
  throw new Error('AES_KEY must be exactly 32 bytes. Set it in your environment.');
}

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
app.use('/admin-ui', cors(), express.static(path.join(__dirname, '../src/admin-ui-dist')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/punchout', punchoutRateLimiter, createPunchoutRouter(config.emporix.tenantId));
app.use('/session', createSessionRouter(config.emporix.tenantId));
app.use('/admin', adminCors, createAdminRouter());
app.use('/', createWidgetRouter());

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Punchout plugin listening on port ${config.port}`);
  });
}

export { app };
