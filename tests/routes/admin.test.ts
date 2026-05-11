import request from 'supertest';
import { app } from '../../src/index';

describe('Admin routes', () => {
  it('returns 401 on GET /admin/config without token', async () => {
    const res = await request(app).get('/admin/config');
    expect(res.status).toBe(401);
  });

  it('returns 401 on POST /admin/config without token', async () => {
    const res = await request(app).post('/admin/config').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 on GET /admin/buyers without token', async () => {
    const res = await request(app).get('/admin/buyers');
    expect(res.status).toBe(401);
  });
});
