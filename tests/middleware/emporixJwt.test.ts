import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { emporixJwtMiddleware } from '../../src/middleware/emporixJwt';

jest.mock('jwks-rsa', () => {
  const factory = jest.fn(() => ({
    getSigningKey: (_kid: unknown, cb: (err: null, key: { getPublicKey: () => string }) => void) => {
      cb(null, { getPublicKey: () => 'test-secret' });
    },
  }));
  return { __esModule: true, default: factory };
});

const makeReq = (token?: string) =>
  ({ headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request);

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
} as unknown as Response);

describe('emporixJwtMiddleware', () => {
  let jwtVerifySpy: jest.SpyInstance;

  beforeEach(() => {
    jwtVerifySpy = jest.spyOn(jwt, 'verify');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls next() and attaches tenantId with a valid token', () => {
    jwtVerifySpy.mockImplementation(
      (_token: unknown, _getKey: unknown, _opts: unknown, callback: jwt.VerifyCallback) => {
        callback(null, { tenantId: 'my-tenant', sub: 'user-1' } as jwt.JwtPayload);
      },
    );

    const req = makeReq('any-token');
    const res = makeRes();
    const next = jest.fn();

    emporixJwtMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.tenantId).toBe('my-tenant');
  });

  it('returns 401 with no authorization header', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    emporixJwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with an invalid token', () => {
    jwtVerifySpy.mockImplementation(
      (_token: unknown, _getKey: unknown, _opts: unknown, callback: jwt.VerifyCallback) => {
        callback(new jwt.JsonWebTokenError('invalid token'));
      },
    );

    const req = makeReq('bad-token');
    const res = makeRes();
    const next = jest.fn();

    emporixJwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
