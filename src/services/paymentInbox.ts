import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { MpesaCallback } from '../models/mpesaCallback';
export function canonicalPayload(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalPayload(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function acceptCallback(endpoint: string): RequestHandler {
  return async (req, res) => {
    const secret = process.env.MPESA_CALLBACK_SHARED_TOKEN;
    const supplied = req.get('X-Mpesa-Callback-Token') || req.query.callbackToken;
    if (!secret || typeof supplied !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return void res.status(403).json({ success: false, message: 'Callback authentication failed' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return void res.status(400).json({ success: false, message: 'Invalid callback payload' });
    const fingerprint = createHash('sha256').update(endpoint + ':' + canonicalPayload(req.body)).digest('hex');
    try { await MpesaCallback.updateOne({ fingerprint }, { $setOnInsert: { endpoint, payload: req.body, fingerprint, status: 'pending' } }, { upsert: true }); }
    catch (error: any) { if (error.code !== 11000) throw error; }
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted', success: true });
  };
}
// Called only by an explicit worker. A crash after a possible debit is held for
// review instead of automatically replaying the callback and risking a second payment.
export async function processPaymentInbox(handlers: Record<string, RequestHandler>) {
  const record = await MpesaCallback.findOneAndUpdate({ status: 'pending' }, { $set: { status: 'processing', claimedAt: new Date() } }, { sort: { createdAt: 1 }, returnDocument: 'after' }).select('+payload');
  if (!record) return;
  try {
    const handler = handlers[record.endpoint]; if (!handler) throw new Error('No callback handler');
    let failed = false;
    const response: any = { headersSent: false, status(code: number) { if (code >= 400) failed = true; return this; }, json() { this.headersSent = true; return this; }, send() { this.headersSent = true; return this; }, end() { this.headersSent = true; return this; } };
    await handler({ body: record.payload } as any, response, (error?: unknown) => { if (error) failed = true; });
    record.status = failed ? 'review' : 'completed'; record.completedAt = new Date();
  } catch { record.status = 'review'; }
  await record.save();
}
