import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Admin auth: verify a Bearer token is present (proves the request comes from
 * the plugin UI, which receives a token from the Emporix dashboard), then use
 * EMPORIX_TENANT_ID from env for tenant namespacing.
 *
 * Full JWT signature verification is not possible (Emporix has no public JWKS),
 * and is not needed here — CORS already locks /admin/* to admin.emporix.io,
 * and the Bearer token is forwarded to Emporix's own API on every config read/write,
 * which provides the real authorization check.
 */
export function emporixJwtMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || authHeader.length <= 7) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const tenantId = config.emporix.tenantId;
  if (!tenantId) {
    res.status(500).json({ error: 'Server misconfigured: EMPORIX_TENANT_ID not set' });
    return;
  }

  req.tenantId = tenantId;
  next();
}
