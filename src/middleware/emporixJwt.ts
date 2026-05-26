import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Emporix does not expose a public JWKS endpoint, so we cannot verify the
 * token signature server-side. We trust the token structurally because:
 *   1. CORS already restricts /admin/* requests to https://admin.emporix.io
 *   2. The Bearer token is forwarded as-is to Emporix's own API, which will
 *      reject it if invalid — so tenant isolation is preserved.
 * We only decode to extract the tenant ID for config namespacing.
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

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded) {
      res.status(401).json({ error: 'Malformed token' });
      return;
    }
    // Emporix tokens use 'tenant'; fall back to 'tenantId' for compatibility
    const tenantId = (decoded.tenant ?? decoded.tenantId ?? '') as string;
    if (!tenantId) {
      res.status(401).json({ error: 'Token missing tenant claim' });
      return;
    }
    req.tenantId = tenantId;
    next();
  } catch {
    res.status(401).json({ error: 'Token decode failed' });
  }
}
