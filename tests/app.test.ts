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
test('custom app origin supports authenticated requests while retaining the existing allowlist', async () => {
  const original = { allowed: process.env.ALLOWED_ORIGINS, app: process.env.APP_ORIGIN };
  try {
    process.env.ALLOWED_ORIGINS = 'https://nexuspayapp-ten.vercel.app';
    process.env.APP_ORIGIN = 'https://app.nexuspayapp.xyz';
    const app = createApp();
    for (const origin of ['https://app.nexuspayapp.xyz', 'https://nexuspayapp-ten.vercel.app']) {
      const response = await request(app).options('/api/auth/google')
        .set('Origin', origin).set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    }
    const denied = await request(app).get('/api/health').set('Origin', 'https://app.nexuspayapp.xyz.example.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  } finally {
    if (original.allowed === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = original.allowed;
    if (original.app === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = original.app;
  }
});
