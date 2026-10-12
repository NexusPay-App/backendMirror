const axios = require('axios');
const { randomUUID, timingSafeEqual } = require('node:crypto');
function createForwarder(endpoint, post = axios.post) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST required' });
    const base = process.env.BACKEND_URL;
    const secret = process.env.MPESA_CALLBACK_SHARED_TOKEN;
    const supplied = req.headers?.['x-mpesa-callback-token'] || req.query?.callbackToken;
    if (!secret) return res.status(503).json({ success: false, message: 'Callback authentication is not configured' });
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) return res.status(403).json({ success: false, message: 'Callback authentication failed' });
    if (!base) return res.status(503).json({ success: false, message: 'Callback forwarding is not configured' });
    try {
      // Await delivery within the serverless invocation. A response must not precede forwarding.
      await post(`${base.replace(/\/$/, '')}/api/mpesa/${endpoint}`, req.body, {
        timeout: 10000,
        maxRedirects: 0,
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': randomUUID(), 'X-Webhook-Source': 'nexuspay-forwarder', ...(secret ? { 'X-Mpesa-Callback-Token': secret } : {}) },
      });
      return res.status(200).json({ success: true, message: 'Callback delivered' });
    } catch {
      // Return a failure so the provider/durable delivery layer can retry. Never log payment payloads.
      return res.status(502).json({ success: false, message: 'Callback delivery failed' });
    }
  };
}
module.exports = { createForwarder };
