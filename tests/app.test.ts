import request from 'supertest';
import { createApp } from '../src/app';
test('app import does not require provider credentials and middleware precedes routes', async () => {
  const app = createApp();
  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200); expect(health.headers['cache-control']).toBe('no-store'); expect(health.headers['x-content-type-options']).toBe('nosniff');
  const metadata = await request(app).get('/api/botchain/networks');
  expect(metadata.body.data.map((n: any) => n.chainId)).toEqual([677,968]);
  expect((await request(app).get('/api/botchain/botchain-testnet/account')).status).toBe(401);
  expect((await request(app).post('/api/mpesa/buy-crypto').send({})).status).toBe(503);
  expect((await request(app).get('/missing')).status).toBe(404);
});
