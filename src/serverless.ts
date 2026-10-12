import type { Request, Response } from 'express';
import app from './app';
import { initializeServices } from './index';
let ready: Promise<void> | undefined;
export default async function handler(req: Request, res: Response) {
  try { await (ready ??= initializeServices().catch(error => { ready = undefined; throw error; })); app(req, res); }
  catch { res.status(503).json({ success: false, message: 'Service initialization failed' }); }
}
