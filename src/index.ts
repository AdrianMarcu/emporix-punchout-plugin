import express from 'express';
import path from 'path';
import { Buffer } from 'buffer';
import helmet from 'helmet';
import { config } from './config';
import { createPunchoutRouter } from './routes/punchout';
import { createSessionRouter } from './routes/session';
import { createAdminRouter } from './admin/router';
import { punchoutRateLimiter } from './middleware/rateLimiter';
import { createWidgetRouter } from './routes/widget';

if (process.env.NODE_ENV !== 'test' && Buffer.byteLength(config.crypto.aesKey, 'utf8') !== 32) {
  throw new Error('AES_KEY must be exactly 32 bytes. Set it in your environment.');
}

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' }));

app.use('/admin-ui', express.static(path.join(__dirname, '../src/admin-ui-dist')));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/punchout', punchoutRateLimiter, createPunchoutRouter(config.emporix.tenantId));
app.use('/session', createSessionRouter(config.emporix.tenantId));
app.use('/admin', createAdminRouter());
app.use('/', createWidgetRouter());

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Punchout plugin listening on port ${config.port}`);
  });
}

export { app };
