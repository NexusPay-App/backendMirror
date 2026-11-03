import type { Request, Response } from 'express';
import app from './app';
import mongoose from 'mongoose';
import { initializeServices } from './index';
let ready: Promise<void> | undefined;
let initialized = false;
export default async function handler(req: Request, res: Response) {
  // A resolved initialization promise is not proof of a live connection after
  // a serverless instance has been frozen. Share one reconnect across requests.
  if (initialized && mongoose.connection.readyState !== 1) { initialized = false; ready = undefined; }
  try {
    await (ready ??= initializeServices().then(() => { initialized = true; }).catch(error => { ready = undefined; throw error; }));
    app(req, res);
  }
  catch (error) {
    const failure = error instanceof Error ? error : new Error('Unknown initialization failure');
    const message = failure.message
      .replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, '$1[redacted]@')
      .replace(/((?:password|passwd|secret)=)[^&\s]+/gi, '$1[redacted]');
    console.error('Service initialization failed', {
      name: failure.name,
      code: 'code' in failure ? failure.code : undefined,
      message,
    });
    res.status(503).json({ success: false, message: 'Service initialization failed' });
  }
}
