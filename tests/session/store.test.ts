import { SessionStore } from '../../src/session/store';
import type { PunchoutSession } from '../../src/session/types';

const makeSession = (overrides: Partial<PunchoutSession> = {}): PunchoutSession => ({
  sessionId: 'sess-001',
  protocol: 'cxml',
  buyerOrgId: 'buyer-org-1',
  customerGroupId: 'cg-1',
  browserFormPostUrl: 'https://buyer.example.com/return',
  buyerCookie: 'cookie-abc',
  emporixCartId: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore({ host: 'localhost', port: 6379 });
  });

  afterEach(async () => {
    await store.disconnect();
  });

  it('saves and retrieves a session', async () => {
    const session = makeSession();
    await store.saveSession(session, 7200);
    const retrieved = await store.getSession('sess-001');
    expect(retrieved).toEqual(session);
  });

  it('returns null for missing session', async () => {
    const result = await store.getSession('nonexistent');
    expect(result).toBeNull();
  });

  it('saves a token mapping and consumes it once', async () => {
    await store.saveToken('token-xyz', 'sess-001', 900);
    const sessionId = await store.consumeToken('token-xyz');
    expect(sessionId).toBe('sess-001');
    const second = await store.consumeToken('token-xyz');
    expect(second).toBeNull();
  });

  it('returns null for expired/missing token', async () => {
    const result = await store.consumeToken('no-such-token');
    expect(result).toBeNull();
  });

  it('updates cart ID on an existing session', async () => {
    await store.saveSession(makeSession(), 7200);
    await store.updateCartId('sess-001', 'cart-999');
    const updated = await store.getSession('sess-001');
    expect(updated?.emporixCartId).toBe('cart-999');
  });

  it('deletes a session', async () => {
    await store.saveSession(makeSession(), 7200);
    await store.deleteSession('sess-001');
    const result = await store.getSession('sess-001');
    expect(result).toBeNull();
  });
});
