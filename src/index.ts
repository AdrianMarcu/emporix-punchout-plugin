import express from 'express';
import { config } from './config';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Punchout plugin listening on port ${config.port}`);
  });
}

export { app };
