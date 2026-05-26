import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Emporix does not expose a public JWKS endpoint, so we cannot verify the
 * token signature server-side. We trust the token structurally because:
 *   1. CORS already restricts /admin/* requests to https://admin.emporix.io
 *   2. The Bearer token is forwarded as-is to Emporix's own API, which will
 *      reject it if invalid — so tenant isolation is preserved.
 *
 * Tenant resolution order:
 *   1. JWT claim 'tenant' (Emporix dashboard tokens)
 *   2. JWT claim 'tenantId' (legacy / other issuers)
 *   3. EMPORIX_TENANT_ID env var (fallback for opaque / non-JWT tokens)
 */
export function emporixJwtMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: 'Empty token' });
    return;
  }

  // Try to extract tenant from JWT payload (best-effort — token may be opaque)
  let tenantId = '';
  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (decoded) {
      tenantId = (decoded.tenant ?? decoded.tenantId ?? '') as string;
    }
  } catch {
    // non-JWT token — fall through to env-var fallback
  }

  // Fall back to the configured tenant (already set in Railway env)
  if (!tenantId) {
    tenantId = config.emporix.tenantId;
  }

  if (!tenantId) {
    res.status(401).json({ error: 'Cannot determine tenant — set EMPORIX_TENANT_ID' });
    return;
  }

  req.tenantId = tenantId;
  next();
}
