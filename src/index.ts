import express from 'express';
import { config } from './config';
import { createPunchoutRouter } from './routes/punchout';
import { createSessionRouter } from './routes/session';
import { createAdminRouter } from './admin/router';
import { punchoutRateLimiter } from './middleware/rateLimiter';
import { createWidgetRouter } from './routes/widget';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' }));

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
