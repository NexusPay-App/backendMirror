import type { RequestHandler } from "express";
import { authenticate } from "./auth";
import { VerifiedSession } from "../models/verifiedSession";
import { sessionKey } from "../services/sessions";
declare global {
  namespace Express {
    interface Request {
      session?: { verified: boolean; verifiedAt: Date };
    }
  }
}
export const enforceStrictAuth: RequestHandler = (req, res, next) => {
  void authenticate(req, res, () => {
    if (!req.authSession?.verified || !req.authSession.verifiedAt)
      return void res
        .status(403)
        .json({ success: false, message: "Verification required" });
    req.session = { verified: true, verifiedAt: req.authSession.verifiedAt };
    next();
  });
};
export async function registerVerifiedSession(
  token: string,
  userId: string,
  expiryHours = 4,
) {
  await VerifiedSession.updateOne(
    {
      _id: sessionKey(token),
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { verified: true, verifiedAt: new Date() } },
  );
}
export async function invalidateSession(token: string) {
  await VerifiedSession.updateOne(
    { _id: sessionKey(token) },
    { $set: { revokedAt: new Date() } },
  );
}
export const startSessionCleanup = () =>
  setInterval(() => {
    void VerifiedSession.deleteMany({ expiresAt: { $lte: new Date() } }).catch(
      () => {},
    );
  }, 3600_000).unref();
