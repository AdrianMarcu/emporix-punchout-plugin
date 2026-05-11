import nock from 'nock';
import { EmporixClient } from '../../src/emporix/client';

const API_BASE = 'https://api.emporix.io';
const TENANT = 'test-tenant';
const TOKEN = 'Bearer test-token';

describe('EmporixClient', () => {
  let client: EmporixClient;

  beforeEach(() => {
    client = new EmporixClient(API_BASE, TENANT, 5000);
  });

  afterEach(() => nock.cleanAll());

  describe('createGuestCart', () => {
    it('creates a cart and returns cartId', async () => {
      nock(API_BASE)
        .post(`/cart/${TENANT}/carts`)
        .reply(201, { cartId: 'cart-001', currency: 'USD' });

      const cartId = await client.createGuestCart('cg-premium', TOKEN);
      expect(cartId).toBe('cart-001');
    });

    it('throws on Emporix error', async () => {
      nock(API_BASE).post(`/cart/${TENANT}/carts`).reply(500, {});
      await expect(client.createGuestCart('cg-premium', TOKEN)).rejects.toThrow('Failed to create Emporix cart');
    });
  });

  describe('getCart', () => {
    it('returns cart with items', async () => {
      nock(API_BASE)
        .get(`/cart/${TENANT}/carts/cart-001`)
        .reply(200, {
          cartId: 'cart-001',
          currency: 'USD',
          items: [
            { itemId: 'i1', sku: 'SKU-001', name: 'Widget', quantity: 2, price: { amount: 49.99, currency: 'USD' }, uom: 'EA' },
          ],
        });

      const cart = await client.getCart('cart-001', TOKEN);
      expect(cart.cartId).toBe('cart-001');
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].sku).toBe('SKU-001');
    });

    it('throws on getCart error', async () => {
      nock(API_BASE).get(`/cart/${TENANT}/carts/missing`).reply(404, {});
      await expect(client.getCart('missing', TOKEN)).rejects.toThrow('Failed to fetch Emporix cart');
    });
  });

  describe('getCustomerGroups', () => {
    it('returns list of customer groups', async () => {
      nock(API_BASE)
        .get(`/customer-group/${TENANT}/customergroups`)
        .reply(200, [{ id: 'cg-1', name: 'Premium' }, { id: 'cg-2', name: 'Standard' }]);

      const groups = await client.getCustomerGroups(TOKEN);
      expect(groups).toHaveLength(2);
      expect(groups[0].id).toBe('cg-1');
    });

    it('throws on getCustomerGroups error', async () => {
      nock(API_BASE).get(`/customer-group/${TENANT}/customergroups`).reply(500, {});
      await expect(client.getCustomerGroups(TOKEN)).rejects.toThrow('Failed to fetch customer groups');
    });
  });
});
