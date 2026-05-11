import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Mock jwks-rsa (required so the module loads without real network calls)
// jwks-rsa is a CJS module that exports a function directly; ts-jest wraps it via esModuleInterop,
// so we must provide both the callable default AND a named `default` property.
const mockJwksClient = {
  getSigningKey: (_kid: unknown, cb: (err: null, key: { getPublicKey: () => string }) => void) => {
    cb(null, { getPublicKey: () => 'test-secret' });
  },
};
const mockJwksFactory = jest.fn(() => mockJwksClient);
jest.mock('jwks-rsa', () => {
  const factory = jest.fn(() => mockJwksClient);
  // Support both `jwksRsa(...)` and `jwksRsa.default(...)`
  (factory as any).default = factory;
  return factory;
});

// Mock jwt.verify so we control pass/fail without worrying about algorithm mismatches
const jwtVerifyMock = jest.spyOn(jwt, 'verify');

import { emporixJwtMiddleware } from '../../src/middleware/emporixJwt';

const makeReq = (token?: string) =>
  ({ headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
};

describe('emporixJwtMiddleware', () => {
  afterEach(() => {
    jwtVerifyMock.mockRestore();
    jest.spyOn(jwt, 'verify'); // restore spy for next test
  });

  it('calls next() and attaches tenantId with a valid token', async () => {
    // Simulate jwt.verify calling the callback with a decoded payload
    jwtVerifyMock.mockImplementation((_token, _key, _opts, callback: any) => {
      callback(null, { tenantId: 'my-tenant', sub: 'user-1' });
    });

    const req = makeReq('any.valid.token');
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>(resolve => {
      emporixJwtMiddleware(req, res, () => { next(); resolve(); });
    });

    expect(next).toHaveBeenCalled();
    expect((req as Request & { tenantId: string }).tenantId).toBe('my-tenant');
  });

  it('returns 401 with no authorization header', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    emporixJwtMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing authorization token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with an invalid/malformed token', async () => {
    // Simulate jwt.verify calling the callback with an error
    jwtVerifyMock.mockImplementation((_token, _key, _opts, callback: any) => {
      callback(new Error('invalid signature'), undefined);
    });

    const req = makeReq('not.a.valid.jwt');
    const res = makeRes();
    const next = jest.fn();

    await new Promise<void>(resolve => {
      emporixJwtMiddleware(req, res, () => resolve());
      // Give async path time to run
      setTimeout(resolve, 100);
    });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});
