const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createForwarder } = require('../lib/forward');
process.env.MPESA_CALLBACK_SHARED_TOKEN = 'callback-unit-test-token';
const callback = { method: 'POST', body: {}, headers: { 'x-mpesa-callback-token': 'callback-unit-test-token' } };
function response() { return { code: null, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('acknowledges only after successful forwarding', async () => {
  process.env.BACKEND_URL = 'https://sandbox.example';
  const res = response();
  await createForwarder('stk-callback', async (url, _body, options) => { assert.equal(url, 'https://sandbox.example/api/mpesa/stk-callback'); assert.equal(res.code, null); assert.equal(options.headers['X-Mpesa-Callback-Token'], process.env.MPESA_CALLBACK_SHARED_TOKEN); })(callback, res);
  assert.equal(res.code, 200);
});
test('does not acknowledge a failed delivery', async () => {
  const res = response();
  await createForwarder('stk-callback', async () => { throw Error('unavailable'); })(callback, res);
  assert.equal(res.code, 502);
});
test('rejects unauthenticated callbacks before forwarding', async () => {
  const res = response();
  await createForwarder('stk-callback', async () => assert.fail('should not forward'))({ method: 'POST', body: {} }, res);
  assert.equal(res.code, 403);
});
test('generic webhook does not forward to a nonexistent backend route', async () => {
  delete process.env.MPESA_DEFAULT_CALLBACK_ENDPOINT;
  const res = response();
  await require('../api/webhook')(callback, res);
  assert.equal(res.code, 503);
});
test('rejects methods that cannot be callbacks', async () => {
  const res = response();
  await createForwarder('stk-callback', async () => assert.fail('should not forward'))({ method: 'GET' }, res);
  assert.equal(res.code, 405);
});
